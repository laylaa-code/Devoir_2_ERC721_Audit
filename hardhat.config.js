require("@nomicfoundation/hardhat-ethers");

const networks = {
  hardhat: { chainId: 31337 },
  localhost: { url: "http://127.0.0.1:8545", chainId: 31337 }
};
// Sepolia s'active uniquement si ces variables sont renseignees.
if (process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_PRIVATE_KEY) {
  networks.sepolia = {
    url: process.env.SEPOLIA_RPC_URL,
    accounts: [process.env.SEPOLIA_PRIVATE_KEY],
    chainId: 11155111
  };
}

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true }
  },
  networks
};
