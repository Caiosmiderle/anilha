import Foundation
import Security
import Supabase

/// Each retired client loses access before another client can open the same Keychain service.
/// Mutable state is protected by the lock, including the Security calls.
final class ChaveiroSessao: AuthLocalStorage, @unchecked Sendable {
    private let lock = NSLock()
    private var encerrado = false
    private let servico = "io.github.caiosmiderle.anilha.auth"
    enum Falha: Error { case keychain(OSStatus), encerrado }

    private func consulta(_ key: String? = nil) -> [String: Any] {
        var q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrService as String: servico]
        if let key { q[kSecAttrAccount as String] = key }
        return q
    }

    func store(key: String, value: Data) throws {
        try lock.withLock {
            guard !encerrado else { throw Falha.encerrado }
            let q = consulta(key)
            let attributes: [String: Any] = [
                kSecValueData as String: value,
                kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            ]
            let updated = SecItemUpdate(q as CFDictionary, attributes as CFDictionary)
            if updated == errSecItemNotFound {
                let status = SecItemAdd(q.merging(attributes) { _, new in new } as CFDictionary, nil)
                guard status == errSecSuccess else { throw Falha.keychain(status) }
            } else if updated != errSecSuccess { throw Falha.keychain(updated) }
        }
    }

    func retrieve(key: String) throws -> Data? {
        try lock.withLock {
            guard !encerrado else { return nil }
            var q = consulta(key)
            q[kSecReturnData as String] = true
            q[kSecMatchLimit as String] = kSecMatchLimitOne
            var result: AnyObject?
            let status = SecItemCopyMatching(q as CFDictionary, &result)
            if status == errSecItemNotFound { return nil }
            guard status == errSecSuccess else { throw Falha.keychain(status) }
            return result as? Data
        }
    }

    func remove(key: String) throws {
        try lock.withLock {
            guard !encerrado else { return }
            let status = SecItemDelete(consulta(key) as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw Falha.keychain(status) }
        }
    }

    func apagarEEncerrar() throws {
        try lock.withLock {
            let status = SecItemDelete(consulta() as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw Falha.keychain(status) }
            encerrado = true
        }
    }
}
