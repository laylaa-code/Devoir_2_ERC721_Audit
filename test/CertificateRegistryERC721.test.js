const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("CertificateRegistryERC721", function () {
  let registry, admin, alice, bob;
  const uri = "data:application/json;base64,eyJuYW1lIjoiQ2VydGlmaWNhdCJ9";

  beforeEach(async function () {
    [admin, alice, bob] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("CertificateRegistryERC721");
    registry = await factory.deploy();
    await registry.waitForDeployment();
  });

  it("cree un ERC-721 unique avec un tokenURI lisible", async function () {
    await (await registry.mintCertificate(alice.address, "2023-INF-042", uri)).wait();
    assert.equal(await registry.ownerOf(1), alice.address);
    assert.equal(await registry.tokenURI(1), uri);
    const cert = await registry.getCertificate(1);
    assert.equal(cert.studentId, "2023-INF-042");
    assert.equal(cert.revoked, false);
  });

  it("refuse le mint sans MINTER_ROLE", async function () {
    await assert.rejects(async () => registry.connect(alice).mintCertificate(alice.address, "ET-1", uri));
  });

  it("bloque le double mint du meme CNE", async function () {
    await (await registry.mintCertificate(alice.address, "ET-1", uri)).wait();
    await assert.rejects(async () => registry.mintCertificate(bob.address, "ET-1", uri));
  });

  it("importe un lot ERC-721", async function () {
    await (await registry.batchMintCertificates(
      [alice.address, bob.address], ["ET-1|" + uri, "ET-2|" + uri]
    )).wait();
    assert.equal(await registry.ownerOf(1), alice.address);
    assert.equal(await registry.ownerOf(2), bob.address);
    assert.equal((await registry.getCertificate(2)).studentId, "ET-2");
  });

  it("bloque les CNE en double au sein du batch", async function () {
    await assert.rejects(async () => registry.batchMintCertificates(
      [alice.address, bob.address], ["ET-1|" + uri, "ET-1|" + uri]
    ));
    assert.equal(await registry.nextTokenId(), 1n);
  });

  it("autorise uniquement l'admin a revoquer et conserve le NFT", async function () {
    await (await registry.mintCertificate(alice.address, "ET-1", uri)).wait();
    await assert.rejects(async () => registry.connect(alice).revokeCertificate(1));
    await (await registry.revokeCertificate(1)).wait();
    assert.equal((await registry.getCertificate(1)).revoked, true);
    assert.equal(await registry.ownerOf(1), alice.address);
    await assert.rejects(async () => registry.revokeCertificate(1));
  });

  it("refuse les valeurs invalides et les tokens inconnus", async function () {
    await assert.rejects(async () => registry.mintCertificate(ethers.ZeroAddress, "ET-1", uri));
    await assert.rejects(async () => registry.mintCertificate(alice.address, "", uri));
    await assert.rejects(async () => registry.mintCertificate(alice.address, "ET-1", ""));
    await assert.rejects(async () => registry.getCertificate(9));
  });

  it("emet les events de creation et de revocation", async function () {
    const tx = await registry.mintCertificate(alice.address, "ET-1", uri);
    const receipt = await tx.wait();
    const names = receipt.logs.flatMap(log => { try { return [registry.interface.parseLog(log)?.name]; } catch { return []; } });
    assert.ok(names.includes("CertificateMinted"));
    const revocation = await (await registry.revokeCertificate(1)).wait();
    const revokedNames = revocation.logs.flatMap(log => { try { return [registry.interface.parseLog(log)?.name]; } catch { return []; } });
    assert.ok(revokedNames.includes("CertificateRevoked"));
  });
});
