import React, { useState } from "react";
import { ethers } from "ethers";
import * as XLSX from "xlsx";
import deployment from "./contract.json";

const RPC_URL = "http://127.0.0.1:8545";
const REQUIRED_COLUMNS = ["studentName", "studentId", "diplomaTitle", "issueDate", "grade"];
const EMPTY_FORM = {
  studentName: "", studentId: "", diplomaTitle: "",
  issueDate: "", recipientAddress: "", grade: ""
};

function checkRow(row) {
  for (const field of REQUIRED_COLUMNS) {
    if (!String(row[field] ?? "").trim()) return `Champ manquant : ${field}`;
  }
  const date = String(row.issueDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) ||
      new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) {
    return "Date attendue : AAAA-MM-JJ";
  }
  if (String(row.studentId).includes("|")) return "Le CNE ne doit pas contenir le caractère |";
  if (String(row.recipientAddress || "").trim() &&
      !ethers.isAddress(String(row.recipientAddress).trim())) {
    return "Adresse du destinataire invalide";
  }
  return "";
}

function recipient(row, defaultAddress) {
  const value = String(row.recipientAddress || "").trim();
  return value ? ethers.getAddress(value) : defaultAddress;
}

// Les informations sont placees dans le tokenURI du NFT, directement sur la blockchain.
function buildTokenURI(row) {
  const metadata = {
    name: `Certificat - ${row.studentName}`,
    description: "Certificat académique",
    studentName: row.studentName.trim(),
    studentId: row.studentId.trim(),
    diplomaTitle: row.diplomaTitle.trim(),
    issueDate: row.issueDate.trim(),
    grade: row.grade.trim(),
    attributes: [
      { trait_type: "CNE", value: row.studentId.trim() },
      { trait_type: "Diplôme", value: row.diplomaTitle.trim() },
      { trait_type: "Date", value: row.issueDate.trim() },
      { trait_type: "Mention", value: row.grade.trim() }
    ]
  };
  const bytes = new TextEncoder().encode(JSON.stringify(metadata));
  const base64 = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
  return "data:application/json;base64," + base64;
}

function decodeTokenURI(uri) {
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix)) throw new Error("Format de tokenURI non pris en charge.");
  const raw = atob(uri.slice(prefix.length));
  const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function getMessage(error) {
  if (error?.code === "ACTION_REJECTED" || error?.code === 4001) {
    return "Transaction annulée dans MetaMask.";
  }
  const raw = error?.shortMessage || error?.reason || error?.message || String(error);
  if (raw.includes("AccessControlUnauthorizedAccount")) return "Compte non autorisé : rôle administrateur ou émetteur requis.";
  return raw;
}

export default function App() {
  const [account, setAccount] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [fileName, setFileName] = useState("");
  const [certId, setCertId] = useState("");
  const [revokeId, setRevokeId] = useState("");
  const [certificate, setCertificate] = useState(null);
  const [message, setMessage] = useState("");
  const [hashes, setHashes] = useState([]);
  const [busy, setBusy] = useState(false);

  async function getAdminContract() {
    if (!window.ethereum) throw new Error("MetaMask n'est pas installé.");
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    const network = await browserProvider.getNetwork();
    if (network.chainId !== 31337n) {
      throw new Error("Sélectionnez le réseau Hardhat Local (ID 31337) dans MetaMask.");
    }
    const signer = await browserProvider.getSigner();
    setAccount(await signer.getAddress());
    return new ethers.Contract(deployment.address, deployment.abi, signer);
  }

  async function connectWallet() {
    try {
      setMessage("");
      if (!window.ethereum) throw new Error("Installez MetaMask avant la démonstration.");
      await window.ethereum.request({ method: "eth_requestAccounts" });
      await getAdminContract();
      setMessage("Portefeuille connecté.");
    } catch (error) { setMessage(getMessage(error)); }
  }

  async function mintOne(event) {
    event.preventDefault();
    const error = checkRow(form);
    if (error) return setMessage(error);
    try {
      setBusy(true);
      setHashes([]);
      setMessage("Confirmez la transaction dans MetaMask...");
      const contract = await getAdminContract();
      const signerAddress = await contract.runner.getAddress();
      const tx = await contract.mintCertificate(
        recipient(form, signerAddress), form.studentId.trim(), buildTokenURI(form)
      );
      setHashes([tx.hash]);
      const receipt = await tx.wait();
      const minted = receipt.logs.flatMap(log => {
        try { const parsed = contract.interface.parseLog(log); return parsed?.name === "CertificateMinted" ? [parsed.args.tokenId.toString()] : []; }
        catch { return []; }
      });
      setMessage(`Certificat ERC-721 n° ${minted[0] || "créé"} émis avec succès.`);
      setForm({ ...EMPTY_FORM });
    } catch (error) { setMessage(getMessage(error)); }
    finally { setBusy(false); }
  }

  async function importExcel(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setMessage(""); setHashes([]);
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("Fichier vide.");
      const headers = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, blankrows: false })[0] || [];
      const missing = REQUIRED_COLUMNS.filter(key => !headers.includes(key));
      if (missing.length) throw new Error("Colonnes manquantes : " + missing.join(", "));
      const parsed = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
      if (!parsed.length) throw new Error("Aucune ligne trouvée.");
      const clean = parsed.map(row => Object.fromEntries(
        [...REQUIRED_COLUMNS, "recipientAddress"].map(key => [key, String(row[key] ?? "").trim()])
      ));
      setRows(clean); setSelected(clean.map((_, i) => i)); setFileName(file.name);
      setMessage(`${clean.length} ligne(s) chargée(s). Vérifiez le tableau avant l'émission.`);
    } catch (error) {
      setRows([]); setSelected([]); setFileName("");
      setMessage(getMessage(error));
    }
  }

  function toggleRow(index) {
    setSelected(previous => previous.includes(index)
      ? previous.filter(value => value !== index)
      : [...previous, index]);
  }

  async function mintSelected() {
    const chosen = [...selected].sort((a, b) => a - b).map(index => rows[index]);
    if (!chosen.length) return setMessage("Sélectionnez au moins une ligne.");
    for (const row of chosen) {
      const error = checkRow(row);
      if (error) return setMessage(`Ligne ${rows.indexOf(row) + 2} : ${error}`);
    }
    if (new Set(chosen.map(row => row.studentId)).size !== chosen.length) {
      return setMessage("Le fichier contient des CNE en double.");
    }
    try {
      setBusy(true); setHashes([]);
      const contract = await getAdminContract();
      const signerAddress = await contract.runner.getAddress();
      const txHashes = [];
      let total = 0;
      for (let start = 0; start < chosen.length; start += 5) {
        const lot = chosen.slice(start, start + 5);
        setMessage(`Lot ${Math.floor(start / 5) + 1} : confirmez dans MetaMask...`);
        const tx = await contract.batchMintCertificates(
          lot.map(row => recipient(row, signerAddress)),
          lot.map(row => row.studentId.trim() + "|" + buildTokenURI(row))
        );
        txHashes.push(tx.hash); setHashes([...txHashes]);
        await tx.wait();
        total += lot.length;
      }
      setMessage(`${total} certificat(s) ERC-721 émis avec succès.`);
    } catch (error) { setMessage(getMessage(error)); }
    finally { setBusy(false); }
  }

  async function revokeOne(event) {
    event.preventDefault();
    try {
      if (!/^\d+$/.test(revokeId) || BigInt(revokeId) < 1n) throw new Error("Identifiant invalide.");
      setBusy(true); setHashes([]);
      const contract = await getAdminContract();
      const tx = await contract.revokeCertificate(BigInt(revokeId));
      setHashes([tx.hash]); await tx.wait();
      setMessage(`Certificat n° ${revokeId} révoqué avec succès.`);
    } catch (error) { setMessage(getMessage(error)); }
    finally { setBusy(false); }
  }

  async function searchCertificate(event) {
    event.preventDefault(); setCertificate(null);
    try {
      if (!/^\d+$/.test(certId.trim()) || BigInt(certId.trim()) < 1n) {
        throw new Error("Saisissez un identifiant positif.");
      }
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(deployment.address, deployment.abi, provider);
      const id = BigInt(certId.trim());
      const record = await contract.getCertificate(id);
      const uri = await contract.tokenURI(id);
      const details = decodeTokenURI(uri);
      setCertificate({ ...details, studentId: record.studentId,
        recipient: record.recipient, revoked: record.revoked, uri });
      setMessage("");
    } catch (error) { setMessage(getMessage(error)); }
  }

  if (!deployment.address || !deployment.abi?.length) {
    return <main><h1>Certification académique — ERC-721</h1>
      <p>Déployez d'abord le contrat avec <code>npm run deploy</code>.</p></main>;
  }

  return (
    <main>
      <header>
        <div className="eyebrow">DEVOIR 2 · STANDARDS ERC & AUDIT</div>
        <h1>Certification académique</h1>
        <p>Émission et vérification de certificats ERC-721 sur Hardhat Local.</p>
        <small>Contrat : <code>{deployment.address}</code></small>
      </header>

      <section>
        <h2>1. Zone administrateur</h2>
        <button type="button" onClick={connectWallet} disabled={busy}>Connecter MetaMask</button>
        {account && <p className="help">Compte connecté : <code>{account}</code></p>}
        <p className="help">Seuls les comptes ayant le rôle MINTER_ROLE peuvent émettre des certificats.</p>

        <h3>Émettre un certificat ERC-721</h3>
        <form onSubmit={mintOne} className="form-grid">
          {[
            ["studentName", "Nom de l'étudiant", "text"],
            ["studentId", "CNE / identifiant", "text"],
            ["diplomaTitle", "Diplôme", "text"],
            ["issueDate", "Date d'émission", "date"],
            ["grade", "Mention / note", "text"],
            ["recipientAddress", "Adresse du destinataire (facultatif)", "text"]
          ].map(([key, label, type]) => (
            <label key={key}>{label}
              <input type={type} value={form[key]}
                onChange={event => setForm({ ...form, [key]: event.target.value })}
                required={key !== "recipientAddress"}
                placeholder={key === "recipientAddress" ? "Vide = compte connecté" : ""} />
            </label>
          ))}
          <div className="full"><button disabled={busy} type="submit">Émettre le certificat</button></div>
        </form>

        <h3>Importer un fichier Excel / CSV</h3>
        <label className="file-label">Choisir un fichier
          <input type="file" accept=".xlsx,.csv" onChange={importExcel} disabled={busy} />
        </label>
        {fileName && <p className="help">Fichier : {fileName}</p>}
        {rows.length > 0 && <>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Choix</th><th>Nom</th><th>CNE</th><th>Diplôme</th><th>Date</th><th>Mention</th><th>Validation</th></tr></thead>
              <tbody>{rows.map((row, index) => <tr key={index}>
                <td><input type="checkbox" checked={selected.includes(index)} onChange={() => toggleRow(index)} disabled={busy} /></td>
                <td>{row.studentName}</td><td>{row.studentId}</td><td>{row.diplomaTitle}</td>
                <td>{row.issueDate}</td><td>{row.grade}</td>
                <td className={checkRow(row) ? "invalid" : "valid"}>{checkRow(row) || "OK"}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="help">{selected.length} ligne(s) sélectionnée(s).</p>
          <button type="button" onClick={mintSelected} disabled={busy}>Émettre les lignes sélectionnées</button>
        </>}

        <h3>Révoquer un certificat</h3>
        <p className="help">Seul le compte administrateur peut révoquer un certificat.</p>
        <form className="search" onSubmit={revokeOne}>
          <label>Identifiant du certificat
            <input type="number" min="1" step="1" value={revokeId}
              onChange={event => setRevokeId(event.target.value)} placeholder="Exemple : 1" required />
          </label>
          <button type="submit" disabled={busy}>Révoquer</button>
        </form>

        {hashes.length > 0 && <div className="hashes"><h3>Transactions</h3>
          {hashes.map(hash => <p key={hash}><code>{hash}</code></p>)}
        </div>}
      </section>

      <section>
        <h2>2. Zone publique</h2>
        <form className="search" onSubmit={searchCertificate}>
          <label>Identifiant du certificat (tokenId)
            <input type="number" min="1" step="1" value={certId}
              onChange={event => setCertId(event.target.value)} placeholder="Exemple : 1" required />
          </label>
          <button type="submit">Vérifier</button>
        </form>
        {certificate && <div className="result">
          <h3>Certificat NFT n° {certId}</h3>
          <p><b>Token ID :</b> {certId}</p>
          <p><b>Étudiant :</b> {certificate.studentName}</p>
          <p><b>CNE :</b> {certificate.studentId}</p>
          <p><b>Diplôme :</b> {certificate.diplomaTitle}</p>
          <p><b>Date :</b> {certificate.issueDate}</p>
          <p><b>Mention :</b> {certificate.grade}</p>
          <p><b>Destinataire :</b> {certificate.recipient}</p>
          <p><b>Statut :</b> <span className={certificate.revoked ? "invalid" : "valid"}>
            {certificate.revoked ? "Révoqué" : "Valide"}
          </span></p>
          <p><b>Token URI :</b></p>
          <div className="token-uri"><code>{certificate.uri}</code></div>
        </div>}
      </section>
      {message && <p role="status" className={"status " + (/succès|connecté/.test(message) ? "success" : "")}>{message}</p>}
    </main>
  );
}
