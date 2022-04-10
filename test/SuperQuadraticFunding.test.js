const { Framework } = require("@superfluid-finance/sdk-core");
const { assert } = require("chai");
const { ethers, web3 } = require("hardhat");
const daiABI = require("./abis/fDAIABI");

const deployFramework = require("@superfluid-finance/ethereum-contracts/scripts/deploy-framework");
const deployTestToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-test-token");
const deploySuperToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-super-token");

const provider = web3;

let accounts;

let sf;
let dai;
let daix;
let superSigner;
let SuperQuadraticFunding;

const errorHandler = (err) => {
    if (err) throw err;
};

before(async function () {

    //get accounts from hardhat
    accounts = await ethers.getSigners();

    //deploy the framework
    await deployFramework(errorHandler, {
        web3,
        from: accounts[0].address,
    });

    //deploy a fake erc20 token
    let fDAIAddress = await deployTestToken(errorHandler, [":", "fDAI"], {
        web3,
        from: accounts[0].address,
    });
    //deploy a fake erc20 wrapper super token around the fDAI token
    let fDAIxAddress = await deploySuperToken(errorHandler, [":", "fDAI"], {
        web3,
        from: accounts[0].address,
    });

    //initialize the superfluid framework...put custom and web3 only bc we are using hardhat locally
    sf = await Framework.create({
        networkName: "custom",
        provider,
        dataMode: "WEB3_ONLY",
        resolverAddress: process.env.RESOLVER_ADDRESS, //this is how you get the resolver address
        protocolReleaseVersion: "test",
    });


    superSigner = await sf.createSigner({
        signer: accounts[0],
        provider: provider
    });
    //use the framework to get the super toen
    daix = await sf.loadSuperToken("fDAIx");

    //get the contract object for the erc20 token
    let daiAddress = daix.underlyingToken.address;
    dai = new ethers.Contract(daiAddress, daiABI, accounts[0]);
    let App = await ethers.getContractFactory("SuperQuadraticFunding", accounts[0]);

    SuperQuadraticFunding = await App.deploy(
        sf.settings.config.hostAddress,
        daix.address
    );

    charityAddress1 = accounts[5].address;
    console.log(charityAddress1);
    charityAddress2 = accounts[6].address;
    charityAddress3 = accounts[7].address;

    const something = await SuperQuadraticFunding.connect(accounts[0]).createIndex();

    SuperQuadraticFunding.addCharity(charityAddress1);
    SuperQuadraticFunding.addCharity(charityAddress2);
    SuperQuadraticFunding.addCharity(charityAddress3);


});

beforeEach(async function () {

    await dai.connect(accounts[0]).mint(
        accounts[0].address, ethers.utils.parseEther("1000")
    );

    await dai.connect(accounts[0]).approve(daix.address, ethers.utils.parseEther("1000"));

    const daixUpgradeOperation = daix.upgrade({
        amount: ethers.utils.parseEther("1000")
    });

    await daixUpgradeOperation.exec(accounts[0]);

    const daiBal = await daix.balanceOf({ account: accounts[0].address, providerOrSigner: accounts[0] });
    console.log('daix bal for acct 0: ', daiBal);
});

describe("sending flows", async function () {

    it("Case #1 - Alice sends a flow to charity", async () => {

        console.log(SuperQuadraticFunding.address);

        // let var1, var2, charityVotes, var4 = await sf.idaV1.getSubscription({
        //     superToken: daix.address,
        //     publisher: SuperQuadraticFunding.address,
        //     indexId: "0",
        //     subscriber: charityAddress1,
        //     providerOrSigner: accounts[0]
        // });

        // console.log('Charity1  Votes before', charityVotes);

        const appInitialBalance = await daix.balanceOf({
            account: SuperQuadraticFunding.address,
            providerOrSigner: accounts[0]
        });

        var cxt = web3.eth.abi.encodeParameter('address', charityAddress1.toString())

        const createFlowOperation = sf.cfaV1.createFlow({
            receiver: SuperQuadraticFunding.address,
            superToken: daix.address,
            flowRate: "100000000",
            userData: cxt
        })

        const txn = await createFlowOperation.exec(accounts[0]);

        const receipt = await txn.wait();

        const appFlowRate = await sf.cfaV1.getNetFlow({
            superToken: daix.address,
            account: SuperQuadraticFunding.address,
            providerOrSigner: superSigner
        });

        const charityFlowRate = await sf.cfaV1.getNetFlow({
            superToken: daix.address,
            account: charityAddress1,
            providerOrSigner: superSigner
        })

        const appFinalBalance = await daix.balanceOf({
            account: SuperQuadraticFunding.address,
            providerOrSigner: superSigner
        });

        // let var12, var22, newCharityVotes, var42 = await sf.idaV1.getSubscription({
        //     publisher: accounts[0].address,
        //     indexId: "0",
        //     subscriber: charityAddress1
        // });

        // console.log('Charity1 Votes after', newCharityVotes);

        assert.equal(
            charityFlowRate, "100000000", "charity not receiving 100% of flowRate"
        );

        assert.equal(
            appFlowRate,
            0,
            "App flowRate not zero"
        );

        assert.equal(
            appInitialBalance.toString(),
            appFinalBalance.toString(),
            "balances aren't equal"
        );
    });

    // it("Case #2 - Alice upates flows to charity", async () => {

    //     const appInitialBalance = await daix.balanceOf({
    //         account: SuperQuadraticFunding.address,
    //         providerOrSigner: accounts[0]
    //     });

    //     const initialCharityFlowRate = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: charityAddress1,
    //         providerOrSigner: superSigner
    //     })

    //     console.log('initial charity flow rate: ', initialCharityFlowRate);

    //     const appFlowRate = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: SuperQuadraticFunding.address,
    //         providerOrSigner: superSigner
    //     });

    //     const senderFlowRate = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: accounts[0].address,
    //         providerOrSigner: superSigner
    //     })
    //     console.log('sender flow rate: ', senderFlowRate);
    //     console.log('sqf address: ', SuperQuadraticFunding.address);
    //     console.log('app flow rate: ', appFlowRate);

    //     var cxt = web3.eth.abi.encodeParameter('address', charityAddress1.toString())

    //     const updateFlowOperation = sf.cfaV1.updateFlow({
    //         receiver: SuperQuadraticFunding.address,
    //         superToken: daix.address,
    //         flowRate: "200000000",
    //         userData: cxt
    //     })

    //     const updateFlowTxn = await updateFlowOperation.exec(accounts[0]);

    //     const updateFlowReceipt = await updateFlowTxn.wait();

    //     const appFinalBalance = await daix.balanceOf({
    //         account: SuperQuadraticFunding.address,
    //         providerOrSigner: superSigner
    //     });

    //     const updatedCharityFlowRate = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: charityAddress1,
    //         providerOrSigner: superSigner
    //     });

    //     assert.equal(
    //         updatedCharityFlowRate, "200000000", "charity not receiving correct updated flowRate"
    //     );

    //     assert.equal(
    //         appFlowRate,
    //         0,
    //         "App flowRate not zero"
    //     );

    //     assert.equal(
    //         appInitialBalance.toString(),
    //         appFinalBalance.toString(),
    //         "balances aren't equal"
    //     );

    // });

    // it('Case 3: multiple users send flows to the same charity', async () => {
    //     const appInitialBalance = await daix.balanceOf({
    //         account: SuperQuadraticFunding.address,
    //         providerOrSigner: accounts[0]
    //     });

    //     const initialCharityFlowRate = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: charityAddress1,
    //         providerOrSigner: superSigner
    //     })

    //     console.log('initial charity flow rate: ', initialCharityFlowRate);

    //     console.log(accounts[2].address);

    //     const daixTransferOperation = daix.transfer({
    //         receiver: accounts[2].address,
    //         amount: ethers.utils.parseEther("500")
    //     });

    //     await daixTransferOperation.exec(accounts[0]);

    //     const account2Balance = await daix.balanceOf({ account: accounts[2].address, providerOrSigner: superSigner });
    //     console.log('account 2 balance ', account2Balance);

    //     var cxt = web3.eth.abi.encodeParameter('address', charityAddress1.toString())

    //     const createFlowOperation2 = sf.cfaV1.createFlow({
    //         receiver: SuperQuadraticFunding.address,
    //         superToken: daix.address,
    //         flowRate: "100000000",
    //         userData: cxt
    //     })

    //     const createFlowOperation2Txn = await createFlowOperation2.exec(accounts[2]);

    //     const createFlowOperation2Receipt = await createFlowOperation2Txn.wait();

    //     const appFlowRate = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: SuperQuadraticFunding.address,
    //         providerOrSigner: superSigner
    //     });

    //     const appFinalBalance = await daix.balanceOf({
    //         account: SuperQuadraticFunding.address,
    //         providerOrSigner: superSigner
    //     });

    //     const updatedOwnerFlowRate2 = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: charityAddress1,
    //         providerOrSigner: superSigner
    //     });

    //     assert.equal(
    //         updatedOwnerFlowRate2, "300000000", "owner not receiving correct updated flowRate"
    //     );

    //     assert.equal(
    //         appFlowRate,
    //         0,
    //         "App flowRate not zero"
    //     );

    //     assert.equal(
    //         appInitialBalance.toString(),
    //         appFinalBalance.toString(),
    //         "balances aren't equal"
    //     );
    // })

    // it("Case #4 - Bob switches from charity1 to charity2", async () => {

    //     const appInitialBalance = await daix.balanceOf({
    //         account: SuperQuadraticFunding.address,
    //         providerOrSigner: accounts[0]
    //     });

    //     const initialCharityFlowRate = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: charityAddress1,
    //         providerOrSigner: superSigner
    //     })

    //     console.log('initial charity flow rate: ', initialCharityFlowRate);

    //     const appFlowRate = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: SuperQuadraticFunding.address,
    //         providerOrSigner: superSigner
    //     });

    //     const senderFlowRate = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: accounts[2].address,
    //         providerOrSigner: superSigner
    //     })
    //     console.log('sender flow rate: ', senderFlowRate);
    //     console.log('sqf address: ', SuperQuadraticFunding.address);
    //     console.log('app flow rate: ', appFlowRate);

    //     var cxt = web3.eth.abi.encodeParameter('address', charityAddress2.toString())

    //     const updateFlowOperation = sf.cfaV1.updateFlow({
    //         receiver: SuperQuadraticFunding.address,
    //         superToken: daix.address,
    //         flowRate: "150000000",
    //         userData: cxt
    //     })

    //     const updateFlowTxn = await updateFlowOperation.exec(accounts[2]);

    //     const updateFlowReceipt = await updateFlowTxn.wait();

    //     const appFinalBalance = await daix.balanceOf({
    //         account: SuperQuadraticFunding.address,
    //         providerOrSigner: superSigner
    //     });

    //     const updatedCharityFlowRate = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: charityAddress1,
    //         providerOrSigner: superSigner
    //     });

    //     const updatedCharityFlowRate2 = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: charityAddress2,
    //         providerOrSigner: superSigner
    //     });

    //     assert.equal(
    //         updatedCharityFlowRate, "200000000", "charity not receiving correct updated flowRate"
    //     );

    //     assert.equal(
    //         updatedCharityFlowRate2, "150000000", "charity not receiving correct updated flowRate"
    //     );

    //     assert.equal(
    //         appFlowRate,
    //         0,
    //         "App flowRate not zero"
    //     );

    //     assert.equal(
    //         appInitialBalance.toString(),
    //         appFinalBalance.toString(),
    //         "balances aren't equal"
    //     );

    // });

    // it("Case #5 - Bob stops the stream to charity2", async () => {

    //     const appInitialBalance = await daix.balanceOf({
    //         account: SuperQuadraticFunding.address,
    //         providerOrSigner: accounts[0]
    //     });

    //     const initialCharity2FlowRate = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: charityAddress2,
    //         providerOrSigner: superSigner
    //     })

    //     console.log('initial charity flow rate: ', initialCharity2FlowRate);

    //     const appFlowRate = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: SuperQuadraticFunding.address,
    //         providerOrSigner: superSigner
    //     });

    //     const senderFlowRate = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: accounts[2].address,
    //         providerOrSigner: superSigner
    //     })
    //     console.log('sender flow rate: ', senderFlowRate);
    //     console.log('sqf address: ', SuperQuadraticFunding.address);
    //     console.log('app flow rate: ', appFlowRate);

    //     const deleteFlowOperation = sf.cfaV1.deleteFlow({
    //         sender: accounts[2].address,
    //         receiver: SuperQuadraticFunding.address,
    //         superToken: daix.address,
    //     })

    //     const deleteFlowTxn = await deleteFlowOperation.exec(accounts[2]);

    //     const deleteFlowReceipt = await deleteFlowTxn.wait();

    //     const appFinalBalance = await daix.balanceOf({
    //         account: SuperQuadraticFunding.address,
    //         providerOrSigner: superSigner
    //     });

    //     const updatedCharityFlowRate2 = await sf.cfaV1.getNetFlow({
    //         superToken: daix.address,
    //         account: charityAddress2,
    //         providerOrSigner: superSigner
    //     });

    //     assert.equal(
    //         updatedCharityFlowRate2, "0", "charity not receiving correct updated flowRate"
    //     );

    //     assert.equal(
    //         appFlowRate,
    //         0,
    //         "App flowRate not zero"
    //     );

    //     assert.equal(
    //         appInitialBalance.toString(),
    //         appFinalBalance.toString(),
    //         "balances aren't equal"
    //     );

    // });

    // // });

    // // describe("Changing owner", async function () {
    // //     it("Case #5 - When the owner changes, the flow changes", async () => {

    // //         const initialCharityFlowRate = await sf.cfaV1.getNetFlow({
    // //             superToken: daix.address,
    // //             account: accounts[1].address,
    // //             providerOrSigner: superSigner
    // //         });

    // //         console.log("initial owner ", await SuperQuadraticFunding.ownerOf(1));
    // //         console.log("initial owner flowRate flowRate: ", initialCharityFlowRate);

    // //         const newOwnerFlowRate = await sf.cfaV1.getNetFlow({
    // //             superToken: daix.address,
    // //             account: accounts[3].address,
    // //             providerOrSigner: superSigner
    // //         });

    // //         console.log("new owner flowRate: ", newOwnerFlowRate);
    // //         assert.equal(0, newOwnerFlowRate, "new owner shouldn't have flow yet");

    // //         await SuperQuadraticFunding.connect(accounts[1]).transferFrom(accounts[1].address, accounts[3].address, 1);

    // //         console.log("new owner, ", await SuperQuadraticFunding.ownerOf(1));

    // //         const initialOwnerUpdatedFlowRate = await sf.cfaV1.getNetFlow({
    // //             superToken: daix.address,
    // //             account: accounts[1].address,
    // //             providerOrSigner: superSigner
    // //         });

    // //         console.log("initial owner updated flow rate", initialOwnerUpdatedFlowRate);

    // //         assert.equal(initialOwnerUpdatedFlowRate, 0, "old owner should no longer be receiving flows");

    // //         const newOwnerUpdatedFlowRate = await sf.cfaV1.getNetFlow({
    // //             superToken: daix.address,
    // //             account: accounts[3].address,
    // //             providerOrSigner: superSigner
    // //         });

    // //         console.log('new owner updated flowrate', newOwnerUpdatedFlowRate);

    // //         assert.equal(newOwnerUpdatedFlowRate, initialCharityFlowRate, "new receiver should be getting all of flow into app")
    // //     });
});



