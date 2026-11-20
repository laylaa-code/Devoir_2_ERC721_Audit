const fs = require("fs");
const path = require("path");
const { ethers, artifacts } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("CertificateRegistryERC721");
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const artifact = await artifacts.readArtifact("CertificateRegistryERC721");
  const deployment = { address, chainId, abi: artifact.abi };

  const destination = chainId === 31337
    ? path.join(__dirname, "../frontend/src/contract.json")
    : path.join(__dirname, "../deployments/sepolia.json");
  fs.writeFileSync(destination, JSON.stringify(deployment, null, 2) + "\n");
  console.log("Compte administrateur :", deployer.address);
  console.log("Reseau (chainId) :", chainId);
  console.log("Adresse du contrat :", address);
  console.log("Transaction de deploiement :", contract.deploymentTransaction().hash);
  console.log("Informations enregistrees dans :", destination);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
