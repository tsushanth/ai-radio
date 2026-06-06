import Foundation
import AppTrackingTransparency
import TikTokBusinessSDK

final class TikTokHelper {
    static let shared = TikTokHelper()

    // TODO: Replace with Audexa TikTok App ID from TikTok Business Manager
    private let appId = "TODO_AUDEXA_TIKTOK_APP_ID"

    private init() {}

    func initialize() {
        let config = TikTokConfig(accessToken: "", appId: appId, tiktokAppId: appId)
        config?.setLogLevel(TikTokLogLevelInfo)
        if let config = config {
            TikTokBusiness.initializeSdk(config)
        }
    }

    func requestTrackingPermission(completion: @escaping (Bool) -> Void = { _ in }) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            ATTrackingManager.requestTrackingAuthorization { status in
                completion(status == .authorized)
            }
        }
    }

    func trackEvent(_ name: String, properties: [String: Any] = [:]) {
        let event = TikTokBaseEvent(eventName: name)
        for (key, value) in properties {
            event.addProperty(withKey: key, value: value)
        }
        TikTokBusiness.trackTTEvent(event)
    }
}
