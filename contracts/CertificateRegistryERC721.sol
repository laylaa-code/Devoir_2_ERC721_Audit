// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CertificateRegistryERC721 is ERC721URIStorage, AccessControl, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public nextTokenId = 1;

    struct Certificate {
        string studentId;
        address recipient;
        bool revoked;
    }

    mapping(uint256 => Certificate) private certificates;
    mapping(bytes32 => bool) private usedStudentIds;

    event CertificateMinted(uint256 indexed tokenId, string studentId, address indexed recipient);
    event CertificateRevoked(uint256 indexed tokenId);

    constructor() ERC721("Certificat Academique", "CERT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    // Le reste des informations (nom, diplome, date, mention) est dans le tokenURI.
    function mintCertificate(address to, string calldata studentId, string calldata uri)
        external onlyRole(MINTER_ROLE) nonReentrant returns (uint256)
    {
        return _createCertificate(to, studentId, uri);
    }

    // Format des uris : "CNE|data:application/json;base64,...".
    // Le prefixe CNE permet de verifier aussi les doublons pendant l'import Excel.
    function batchMintCertificates(address[] calldata to, string[] calldata uris)
        external onlyRole(MINTER_ROLE) nonReentrant
    {
        require(to.length > 0 && to.length == uris.length, "Listes invalides");
        for (uint256 i = 0; i < to.length; i++) {
            (string memory studentId, string memory uri) = _splitStudentAndUri(uris[i]);
            _createCertificate(to[i], studentId, uri);
        }
    }

    function revokeCertificate(uint256 tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_ownerOf(tokenId) != address(0), "Certificat introuvable");
        require(!certificates[tokenId].revoked, "Deja revoque");
        certificates[tokenId].revoked = true;
        emit CertificateRevoked(tokenId);
    }

    function getCertificate(uint256 tokenId) external view returns (Certificate memory) {
        require(_ownerOf(tokenId) != address(0), "Certificat introuvable");
        return certificates[tokenId];
    }

    function _createCertificate(address to, string memory studentId, string memory uri)
        internal returns (uint256 tokenId)
    {
        require(to != address(0), "Adresse nulle interdite");
        require(bytes(studentId).length > 0, "CNE obligatoire");
        require(bytes(uri).length > 0, "URI obligatoire");

        bytes32 key = keccak256(bytes(studentId));
        require(!usedStudentIds[key], "CNE deja enregistre");

        tokenId = nextTokenId++;
        usedStudentIds[key] = true;
        certificates[tokenId] = Certificate(studentId, to, false);
        _setTokenURI(tokenId, uri);
        _safeMint(to, tokenId);
        emit CertificateMinted(tokenId, studentId, to);
    }

    function _splitStudentAndUri(string memory item)
        internal pure returns (string memory studentId, string memory uri)
    {
        bytes memory data = bytes(item);
        uint256 separator = data.length;
        for (uint256 i = 0; i < data.length; i++) {
            if (data[i] == 0x7c) { separator = i; break; }
        }
        require(separator > 0 && separator + 1 < data.length, "Format CNE|URI attendu");
        bytes memory idBytes = new bytes(separator);
        bytes memory uriBytes = new bytes(data.length - separator - 1);
        for (uint256 i = 0; i < separator; i++) idBytes[i] = data[i];
        for (uint256 i = 0; i < uriBytes.length; i++) uriBytes[i] = data[separator + 1 + i];
        return (string(idBytes), string(uriBytes));
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721URIStorage, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
