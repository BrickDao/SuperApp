require("@nomiclabs/hardhat-ethers");

//kovan addresses - change if using a different network
const host = '0xEB796bdb90fFA0f28255275e16936D25d3418603';
const fDAIx = '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f';

//your address here...
const owner = "0x12924778CD4BE86d491405281E73FB03e5a5a82F";

//to deploy, run yarn hardhat deploy --network kovan

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  console.log(deployer);

  await deploy("SuperQuadraticFunding", {
    from: deployer,
    args: [host, fDAIx],
    log: true,
  })
  module.exports.tags = ["SuperQuadraticFunding"];
}
