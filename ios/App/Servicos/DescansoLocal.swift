import Foundation
import UserNotifications

@MainActor
final class DescansoLocal: NSObject, UNUserNotificationCenterDelegate {
    private var fila: Task<Void, Never>?
    private var versao = UUID()
    private let identifier = "anilha-descanso"
    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
        willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func permitir() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
    }
    /// Serial operations prevent a delayed add from restoring a cancelled rest after sign out.
    func atualizar(fim: Double?) {
        let anterior = fila, revision = UUID()
        versao = revision
        fila = Task {
            await anterior?.value
            guard versao == revision else { return }
            let center = UNUserNotificationCenter.current()
            center.removePendingNotificationRequests(withIdentifiers: [identifier])
            center.removeDeliveredNotifications(withIdentifiers: [identifier])
            guard let fim else { return }
            guard fim / 1000 > Date.now.timeIntervalSince1970 else { return }
            let settings = await center.notificationSettings()
            guard versao == revision, settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
            let seconds = fim / 1000 - Date.now.timeIntervalSince1970
            guard seconds > 0 else { return }
            let content = UNMutableNotificationContent()
            content.title = "Descanso concluído"
            content.body = "Quando estiver pronto, continue seu treino no Anilha."
            content.sound = .default
            let request = UNNotificationRequest(identifier: identifier, content: content,
                trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(1, seconds), repeats: false))
            try? await center.add(request)
            if versao != revision { center.removePendingNotificationRequests(withIdentifiers: [identifier]) }
        }
    }
}
