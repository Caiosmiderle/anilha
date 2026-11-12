// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AnilhaCore",
    platforms: [.iOS("26.0"), .macOS(.v14)],
    products: [
        .library(name: "AnilhaCore", targets: ["AnilhaCore"]),
        .library(name: "AnilhaCache", targets: ["AnilhaCache"]),
    ],
    targets: [
        .target(name: "AnilhaCore", resources: [.process("Resources")]),
        .target(name: "AnilhaCache", dependencies: ["AnilhaCore"]),
        .testTarget(name: "AnilhaCoreTests", dependencies: ["AnilhaCore"], resources: [.copy("Fixtures")]),
        .testTarget(name: "AnilhaCacheTests", dependencies: ["AnilhaCache", "AnilhaCore"]),
    ]
)
