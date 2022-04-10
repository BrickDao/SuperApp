// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import {ISuperfluid, ISuperToken, ISuperApp, ISuperAgreement, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol"; //"@superfluid-finance/ethereum-monorepo/packages/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";

import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";

import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract SuperQuadraticFunding is SuperAppBase, Ownable {
    using CFAv1Library for CFAv1Library.InitData;

    //initialize cfaV1 variable
    CFAv1Library.InitData public cfaV1;

    ISuperfluid private _host; // host
    IConstantFlowAgreementV1 private _cfa; // the stored constant flow agreement class address
    ISuperToken private _acceptedToken; // accepted token
    mapping(address => int96) public charityToFlowRate;
    mapping(address => bool) public charities;
    mapping(address => address) public userToCharity;
    mapping(address => int96) public userToFlowRate;

    constructor(ISuperfluid host, ISuperToken acceptedToken) {
        assert(address(host) != address(0));
        assert(address(acceptedToken) != address(0));
        //assert(!_host.isApp(ISuperApp(receiver)));

        _host = host;
        _cfa = IConstantFlowAgreementV1(
            address(
                host.getAgreementClass(
                    keccak256(
                        "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
                    )
                )
            )
        );
        _acceptedToken = acceptedToken;

        cfaV1 = CFAv1Library.InitData(_host, _cfa);

        uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL;
        _host.registerApp(configWord);

        transferOwnership(msg.sender);
    }

    event Flow(address _from, int96 _flowrate1, int96 _flowrate2);

    /**************************************************************************
     * Charity Managment
     *************************************************************************/
    modifier isValidCharity(address charity) {
        require(charities[charity]);
        _;
    }

    function addCharity(address charity) external onlyOwner {
        require(!charities[charity]);
        charities[charity] = true;
    }

    function removeCharity(address charity)
        external
        isValidCharity(charity)
        onlyOwner
    {
        //remove flows cancel all Subscribtions that go into the SuperApp that are going to the charity
        cfaV1.deleteFlow(address(this), charity, _acceptedToken);
        charities[charity] = false;
    }

    /**************************************************************************
     * Flow Managment CFA
     *************************************************************************/

    //this will reduce the flow or delete it
    function _reduceFlow(
        address to,
        int96 flowRate,
        bytes memory ctx
    ) internal returns (bytes memory) {
        if (to == address(this)) return ctx;

        (, int96 outFlowRate, , ) = _cfa.getFlow(
            _acceptedToken,
            address(this),
            to
        );

        if (outFlowRate == flowRate) {
            return
                cfaV1.deleteFlowWithCtx(ctx, address(this), to, _acceptedToken);
        } else if (outFlowRate > flowRate) {
            // reduce the outflow by flowRate;
            // shouldn't overflow, because we just checked that it was bigger.
            return
                cfaV1.updateFlowWithCtx(
                    ctx,
                    to,
                    _acceptedToken,
                    outFlowRate - flowRate
                );
        }
        // won't do anything if outFlowRate < flowRate
    }

    //this will increase the flow or create it
    function _increaseFlow(
        address to,
        int96 flowRate,
        bytes memory ctx
    ) internal returns (bytes memory) {
        if (to == address(0)) return ctx;

        (, int96 outFlowRate, , ) = _cfa.getFlow(
            _acceptedToken,
            address(this),
            to
        ); //returns 0 if stream doesn't exist
        if (outFlowRate == 0) {
            return cfaV1.createFlowWithCtx(ctx, to, _acceptedToken, flowRate);
        } else {
            // increase the outflow by flowRates[tokenId]
            return
                cfaV1.updateFlowWithCtx(
                    ctx,
                    to,
                    _acceptedToken,
                    outFlowRate + flowRate
                );
        }
    }

    /**************************************************************************
     * SuperApp callbacks
     *************************************************************************/

    function beforeAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata, //_agreementData,
        bytes calldata _ctx
    )
        external
        view
        override
        onlyHost
        onlyExpected(_superToken, _agreementClass)
        returns (bytes memory cbdata)
    {
        ISuperfluid.Context memory decompiledContext = _host.decodeCtx(_ctx);
        address charity = abi.decode(decompiledContext.userData, (address));
        require(charities[charity], "SQF: Not a valid charity");
        //isValidCharity(charity); TypeError

        address user = _host.decodeCtx(_ctx).msgSender;

        return abi.encode(user, charity);
    }

    function afterAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata, /*_agreementData*/
        bytes calldata _cbdata,
        bytes calldata _ctx
    )
        external
        override
        onlyExpected(_superToken, _agreementClass)
        onlyHost
        returns (bytes memory newCtx)
    {
        (address user, address charity) = abi.decode(
            _cbdata,
            (address, address)
        );
        (, int96 newFlowRate, , ) = _cfa.getFlow(
            _acceptedToken,
            user,
            address(this)
        );
        require(newFlowRate > 0, "SQF : Stream was not created");
        // emit Flow(charity, newFlowRate, newFlowRate);
        newCtx = _increaseFlow(charity, newFlowRate, _ctx);
        charityToFlowRate[charity] = charityToFlowRate[charity] + newFlowRate;
        userToFlowRate[user] = newFlowRate;
        userToCharity[user] = charity;

        return newCtx;
    }

    function beforeAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32 _agreementId,
        bytes calldata, //_agreementData,
        bytes calldata _ctx
    )
        external
        view
        override
        onlyHost
        onlyExpected(_superToken, _agreementClass)
        returns (bytes memory cbdata)
    {
        ISuperfluid.Context memory decompiledContext = _host.decodeCtx(_ctx);
        address newCharity = abi.decode(decompiledContext.userData, (address));
        require(charities[newCharity], "SQF: Not a valid charity");
        //isValidCharity(newCharity); TypeError

        (, int96 oldFlowRate, , ) = IConstantFlowAgreementV1(_agreementClass)
            .getFlowByID(_acceptedToken, _agreementId);
        address user = _host.decodeCtx(_ctx).msgSender;

        return abi.encode(user, newCharity, oldFlowRate);
    }

    function afterAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, // _agreementId,
        bytes calldata, //agreementData,
        bytes calldata _cbdata,
        bytes calldata _ctx
    )
        external
        override
        onlyExpected(_superToken, _agreementClass)
        onlyHost
        returns (bytes memory newCtx)
    {
        (address user, address newCharity, int96 oldFlowRate) = abi.decode(
            _cbdata,
            (address, address, int96)
        );
        (, int96 newFlowRate, , ) = _cfa.getFlow(
            _acceptedToken,
            user,
            address(this)
        );

        //User Picks new Charity
        address oldCharity = userToCharity[user];
        if (userToCharity[user] != newCharity) {
            newCtx = _reduceFlow(oldCharity, oldFlowRate, _ctx);
            newCtx = _increaseFlow(newCharity, newFlowRate, newCtx);

            userToCharity[user] = newCharity;
            charityToFlowRate[oldCharity] =
                charityToFlowRate[oldCharity] -
                oldFlowRate;
            charityToFlowRate[newCharity] =
                charityToFlowRate[newCharity] +
                newFlowRate;
        }
        //User donates to the old charity
        else {
            int96 flowRateChange = newFlowRate - oldFlowRate;
            if (flowRateChange > 0) {
                newCtx = _increaseFlow(newCharity, flowRateChange, _ctx);
            }
            //flow is redduced or deleted
            else {
                newCtx = _reduceFlow(newCharity, flowRateChange * -1, _ctx);
            }
            charityToFlowRate[newCharity] =
                charityToFlowRate[newCharity] +
                flowRateChange;
        }

        userToFlowRate[user] = newFlowRate;

        return newCtx;
    }

    function beforeAgreementTerminated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, /*agreementId*/
        bytes calldata, /*agreementData*/
        bytes calldata /*ctx*/
    ) external view override onlyHost returns (bytes memory cbdata) {
        // According to the app basic law, we should never revert in a termination callback
        if (!_isSameToken(_superToken) || !_isCFAv1(_agreementClass))
            return abi.encode(true);
        return abi.encode(false);
    }

    function afterAgreementTerminated(
        ISuperToken, //_superToken,
        address, //_agreementClass,
        bytes32, //_agreementId,
        bytes calldata, //_agreementData,
        bytes calldata _cbdata,
        bytes calldata _ctx
    ) external override onlyHost returns (bytes memory newCtx) {
        // According to the app basic law, we should never revert in a termination callback
        bool shouldIgnore = abi.decode(_cbdata, (bool));
        if (shouldIgnore) return _ctx;

        address user = _host.decodeCtx(_ctx).msgSender;
        address charity = userToCharity[user];
        int96 flowRate = userToFlowRate[user];
        newCtx = _reduceFlow(charity, flowRate, _ctx);

        charityToFlowRate[charity] = charityToFlowRate[charity] - flowRate;
        userToFlowRate[user] = 0;
        userToCharity[user] = address(0);
        return newCtx;
    }

    function _isSameToken(ISuperToken superToken) private view returns (bool) {
        return address(superToken) == address(_acceptedToken);
    }

    function _isCFAv1(address agreementClass) private view returns (bool) {
        return
            ISuperAgreement(agreementClass).agreementType() ==
            keccak256(
                "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
            );
    }

    modifier onlyHost() {
        require(msg.sender == address(_host), "SQF: support only one host");
        _;
    }

    modifier onlyExpected(ISuperToken superToken, address agreementClass) {
        require(_isSameToken(superToken), "SQF: not accepted token");
        require(_isCFAv1(agreementClass), "SQF: only CFAv1 supported");
        _;
    }
}
