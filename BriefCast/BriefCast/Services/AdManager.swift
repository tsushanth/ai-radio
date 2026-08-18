import GoogleMobileAds
import UIKit

/// Manages AdMob interstitial and rewarded ads for Audexa.
/// - Interstitial: plays during radio ad breaks
/// - Rewarded: unlocks Deep Dive for free users
@MainActor
final class AdManager: ObservableObject {
    static let shared = AdManager()

    // MARK: - Ad Unit IDs

    private enum AdUnit {
        static let interstitial = "ca-app-pub-5764510017766009/7992800652"
        static let rewarded = "ca-app-pub-5764510017766009/7879585166"
    }

    // MARK: - State

    @Published var interstitialReady = false
    @Published var rewardedReady = false
    @Published var didEarnReward = false

    private var interstitialAd: GADInterstitialAd?
    private var rewardedAd: GADRewardedAd?

    private init() {}

    // MARK: - Initialize

    func configure() {
        // Disable AdMob's automatic audio session management to avoid conflicts with radio playback.
        // AudioService is the single owner of AVAudioSession — it configures the exclusive
        // .playback/.spokenAudio category and re-asserts it on every play()/resume(). AdManager
        // must NOT also touch AVAudioSession: GADMobileAds.start() (and later ad loads) can
        // internally mutate the shared session on its own async timeline regardless of this flag,
        // and a second, uncoordinated setCategory/setActive call here raced against AudioService's
        // setup — sometimes landing *after* playback had already started and briefly reconfiguring
        // the session out from under it, which is what let another app's audio session request slip
        // through without BriefCast getting cleanly interrupted/paused.
        GADMobileAds.sharedInstance().audioVideoManager.audioSessionIsApplicationManaged = true

        GADMobileAds.sharedInstance().start { _ in
            print("[AdManager] AdMob SDK initialized")
        }
        loadInterstitial()
        loadRewarded()
    }

    // MARK: - Interstitial (Radio Ad Breaks)

    func loadInterstitial() {
        GADInterstitialAd.load(withAdUnitID: AdUnit.interstitial, request: GADRequest()) { [weak self] ad, error in
            Task { @MainActor in
                if let error {
                    print("[AdManager] Interstitial load failed: \(error.localizedDescription)")
                    self?.interstitialReady = false
                    return
                }
                self?.interstitialAd = ad
                self?.interstitialReady = true
                print("[AdManager] Interstitial loaded")
            }
        }
    }

    /// Show interstitial ad. Returns true if shown, false if not ready (fall back to countdown).
    @discardableResult
    func showInterstitial() -> Bool {
        guard let ad = interstitialAd,
              let rootVC = UIApplication.shared.connectedScenes
                .compactMap({ ($0 as? UIWindowScene)?.keyWindow?.rootViewController })
                .first else {
            return false
        }

        ad.present(fromRootViewController: rootVC)
        interstitialAd = nil
        interstitialReady = false

        // Pre-load next one
        loadInterstitial()
        return true
    }

    // MARK: - Rewarded (Deep Dive Unlock)

    func loadRewarded() {
        GADRewardedAd.load(withAdUnitID: AdUnit.rewarded, request: GADRequest()) { [weak self] ad, error in
            Task { @MainActor in
                if let error {
                    print("[AdManager] Rewarded load failed: \(error.localizedDescription)")
                    self?.rewardedReady = false
                    return
                }
                self?.rewardedAd = ad
                self?.rewardedReady = true
                print("[AdManager] Rewarded loaded")
            }
        }
    }

    /// Show rewarded ad. Calls completion with true if reward earned.
    func showRewarded(completion: @escaping (Bool) -> Void) {
        guard let ad = rewardedAd,
              let rootVC = UIApplication.shared.connectedScenes
                .compactMap({ ($0 as? UIWindowScene)?.keyWindow?.rootViewController })
                .first else {
            completion(false)
            return
        }

        ad.present(fromRootViewController: rootVC) { [weak self] in
            // User earned the reward
            self?.didEarnReward = true
            completion(true)
            print("[AdManager] Reward earned!")
        }

        rewardedAd = nil
        rewardedReady = false
        loadRewarded()
    }
}
