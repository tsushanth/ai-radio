//
//  PodcastService.swift
//  BriefCast
//
//  Service for generating morning brief podcasts from email and calendar data
//

import Foundation

// MARK: - Podcast Error Types

/// Error codes returned from the backend
enum PodcastErrorCode: String, Codable {
    case tokenExpired = "TOKEN_EXPIRED"
    case tokenRevoked = "TOKEN_REVOKED"
    case tokenInvalid = "TOKEN_INVALID"
    case reauthRequired = "REAUTH_REQUIRED"
    case noEmails = "NO_EMAILS"
    case insufficientContent = "INSUFFICIENT_CONTENT"
    case scriptGenerationFailed = "SCRIPT_GENERATION_FAILED"
    case invalidScriptFormat = "INVALID_SCRIPT_FORMAT"
    case ttsFailed = "TTS_FAILED"
    case storageError = "STORAGE_ERROR"
    case databaseError = "DATABASE_ERROR"
    case unknownError = "UNKNOWN_ERROR"
}

/// Actions the UI should take based on error
enum PodcastErrorAction: String, Codable {
    case relinkGmail = "RELINK_GMAIL"
    case relinkOutlook = "RELINK_OUTLOOK"
    case retry = "RETRY"
    case contactSupport = "CONTACT_SUPPORT"
    case none = "NONE"
}

/// Structured error from backend
struct PodcastAPIError: Error, Codable {
    let code: PodcastErrorCode
    let message: String
    let action: PodcastErrorAction
    let retryable: Bool
    let details: String?

    enum CodingKeys: String, CodingKey {
        case code, message, action, retryable, details
    }

    var localizedDescription: String {
        return message
    }

    var requiresRelink: Bool {
        return action == .relinkGmail || action == .relinkOutlook
    }

    var isAuthError: Bool {
        return code == .tokenExpired || code == .tokenRevoked ||
               code == .tokenInvalid || code == .reauthRequired
    }

    var isContentError: Bool {
        return code == .noEmails || code == .insufficientContent
    }
}

/// Response wrapper when API returns an error
struct PodcastErrorResponse: Codable {
    let success: Bool
    let error: PodcastAPIError?
    let noContent: Bool?
}

actor PodcastService {
    static let shared = PodcastService()

    private let baseURL = "https://ai-radio-backend.fly.dev/api"

    /// Custom URLSession with extended timeout for long-running generation requests
    /// Podcast generation can take 3-5 minutes due to GPT-4 script generation and TTS
    private let longRunningSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 300  // 5 minutes for request timeout
        config.timeoutIntervalForResource = 360 // 6 minutes total resource timeout
        config.waitsForConnectivity = true
        return URLSession(configuration: config)
    }()

    // MARK: - Generate Podcast

    struct GeneratePodcastRequest: Codable {
        let userId: String
        let date: String  // Client's local date in YYYY-MM-DD format
        let preferences: Preferences

        enum CodingKeys: String, CodingKey {
            case userId = "user_id"
            case date
            case preferences
        }

        struct Preferences: Codable {
            let briefingTime: String
            let topics: [String]
            let voiceHost1: String
            let voiceHost2: String
            let includeWeather: Bool
            let includeCalendar: Bool
            let includeEmail: Bool
            let language: String
            let includeTopicTeasers: Bool

            enum CodingKeys: String, CodingKey {
                case briefingTime = "briefing_time"
                case topics
                case voiceHost1 = "voice_host1"
                case voiceHost2 = "voice_host2"
                case includeWeather = "include_weather"
                case includeCalendar = "include_calendar"
                case includeEmail = "include_email"
                case language
                case includeTopicTeasers = "include_topic_teasers"
            }
        }
    }

    struct GeneratePodcastResponse: Codable {
        let success: Bool
        let episode: EpisodeInfo
        let costEstimate: CostEstimate

        enum CodingKeys: String, CodingKey {
            case success
            case episode
            case costEstimate = "cost_estimate"
        }

        struct EpisodeInfo: Codable {
            let id: String
            let audioUrl: String
            let durationSeconds: Int
            let scriptSegments: Int

            enum CodingKeys: String, CodingKey {
                case id
                case audioUrl = "audio_url"
                case durationSeconds = "duration_seconds"
                case scriptSegments = "script_segments"
            }
        }

        struct CostEstimate: Codable {
            let scriptCostUsd: Double
            let ttsCostUsd: Double
            let totalCostUsd: Double

            enum CodingKeys: String, CodingKey {
                case scriptCostUsd = "script_cost_usd"
                case ttsCostUsd = "tts_cost_usd"
                case totalCostUsd = "total_cost_usd"
            }
        }
    }

    /// Generate a morning brief podcast
    func generatePodcast(
        for userEmail: String,
        preferences: UserPreferences
    ) async throws -> GeneratePodcastResponse {
        let url = URL(string: "\(baseURL)/podcast/generate")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Use client's local date to ensure consistency with UI
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let localDate = dateFormatter.string(from: Date())

        let requestBody = GeneratePodcastRequest(
            userId: userEmail,
            date: localDate,
            preferences: GeneratePodcastRequest.Preferences(
                briefingTime: preferences.briefingTime ?? "07:00",
                topics: preferences.topics ?? [],
                voiceHost1: preferences.voiceHost1 ?? "nova",
                voiceHost2: preferences.voiceHost2 ?? "onyx",
                includeWeather: preferences.includeWeather ?? false,
                includeCalendar: preferences.includeCalendar ?? true,
                includeEmail: preferences.includeEmail ?? true,
                language: preferences.language ?? "en",
                includeTopicTeasers: preferences.includeTopicTeasers ?? true
            )
        )

        request.httpBody = try JSONEncoder().encode(requestBody)

        // Use the long-running session with extended timeout (5+ minutes)
        // Podcast generation involves GPT-4 script generation + TTS which can take 3-5 minutes
        let (data, response) = try await longRunningSession.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NSError(domain: "PodcastService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
        }

        // Success case - 201 Created
        if httpResponse.statusCode == 201 {
            return try JSONDecoder().decode(GeneratePodcastResponse.self, from: data)
        }

        // Try to parse structured error response from backend
        if let errorResponse = try? JSONDecoder().decode(PodcastErrorResponse.self, from: data),
           let apiError = errorResponse.error {
            // Throw the structured error so HomeViewModel can handle it
            throw apiError
        }

        // Fallback: Try old error format for backwards compatibility
        if let errorJson = try? JSONDecoder().decode([String: String].self, from: data),
           let errorMessage = errorJson["error"] {
            throw NSError(domain: "PodcastService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorMessage])
        }

        // Generic error if we can't parse anything
        throw NSError(domain: "PodcastService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Failed to generate podcast"])
    }

    // MARK: - Fetch Episodes

    struct EpisodesResponse: Codable {
        let success: Bool
        let episodes: [Episode]
        let pagination: Pagination

        struct Episode: Codable {
            let id: String
            let title: String
            let description: String
            let audioUrl: String
            let durationSeconds: Int
            let generatedAt: String

            enum CodingKeys: String, CodingKey {
                case id
                case title
                case description
                case audioUrl = "audio_url"
                case durationSeconds = "duration_seconds"
                case generatedAt = "generated_at"
            }
        }

        struct Pagination: Codable {
            let limit: Int
            let offset: Int
            let total: Int
        }
    }

    /// Fetch user's podcast episodes
    func fetchEpisodes(
        for userEmail: String,
        limit: Int = 10,
        offset: Int = 0
    ) async throws -> EpisodesResponse {
        var components = URLComponents(string: "\(baseURL)/podcast/episodes/\(userEmail)")!
        components.queryItems = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset))
        ]

        let url = components.url!
        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw NSError(domain: "PodcastService", code: -2, userInfo: [NSLocalizedDescriptionKey: "Failed to fetch episodes"])
        }

        return try JSONDecoder().decode(EpisodesResponse.self, from: data)
    }

    // MARK: - Cost Estimation

    struct CostEstimationRequest: Codable {
        let userId: String
        let preferences: Preferences

        enum CodingKeys: String, CodingKey {
            case userId = "user_id"
            case preferences
        }

        struct Preferences: Codable {
            let includeEmail: Bool
            let includeCalendar: Bool

            enum CodingKeys: String, CodingKey {
                case includeEmail = "include_email"
                case includeCalendar = "include_calendar"
            }
        }
    }

    struct CostEstimationResponse: Codable {
        let success: Bool
        let estimate: Estimate

        struct Estimate: Codable {
            let scriptCostUsd: Double
            let ttsCostUsd: Double
            let totalCostUsd: Double
            let estimatedDurationSeconds: Int

            enum CodingKeys: String, CodingKey {
                case scriptCostUsd = "script_cost_usd"
                case ttsCostUsd = "tts_cost_usd"
                case totalCostUsd = "total_cost_usd"
                case estimatedDurationSeconds = "estimated_duration_seconds"
            }
        }
    }

    /// Estimate cost before generating podcast
    func estimateCost(
        for userEmail: String,
        includeEmail: Bool,
        includeCalendar: Bool
    ) async throws -> CostEstimationResponse {
        let url = URL(string: "\(baseURL)/podcast/estimate")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let requestBody = CostEstimationRequest(
            userId: userEmail,
            preferences: CostEstimationRequest.Preferences(
                includeEmail: includeEmail,
                includeCalendar: includeCalendar
            )
        )

        request.httpBody = try JSONEncoder().encode(requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw NSError(domain: "PodcastService", code: -3, userInfo: [NSLocalizedDescriptionKey: "Failed to estimate cost"])
        }

        return try JSONDecoder().decode(CostEstimationResponse.self, from: data)
    }

    // MARK: - Async Generation with Polling

    /// Response from starting async generation
    struct AsyncGenerateResponse: Codable {
        let success: Bool
        let jobId: String
        let status: String
        let message: String
    }

    /// Job status response from polling
    struct JobStatusResponse: Codable {
        let success: Bool
        let jobId: String
        let status: String  // "queued", "processing", "completed", "failed"
        let progress: Int
        let message: String
        let createdAt: String
        let updatedAt: String
        let episode: EpisodeResult?
        let error: JobError?

        struct EpisodeResult: Codable {
            let id: String
            let audioUrl: String
            let durationSeconds: Int
            let title: String?
            let status: String?
            let script: ScriptInfo?

            enum CodingKeys: String, CodingKey {
                case id
                case audioUrl  // Backend async endpoint returns camelCase
                case durationSeconds
                case title
                case status
                case script
            }

            struct ScriptInfo: Codable {
                let segments: [ScriptSegment]?
                let totalSegments: Int?
                let estimatedDurationSeconds: Int?
            }

            struct ScriptSegment: Codable {
                let speaker: String
                let text: String
                let type: String
            }
        }

        struct JobError: Codable {
            let code: String
            let message: String
            let action: String
            let retryable: Bool
        }
    }

    /// Start async podcast generation - returns job ID immediately
    func startAsyncGeneration(
        for userEmail: String,
        preferences: UserPreferences
    ) async throws -> String {
        let url = URL(string: "\(baseURL)/podcast/generate-async")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Use client's local date
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let localDate = dateFormatter.string(from: Date())

        let requestBody = GeneratePodcastRequest(
            userId: userEmail,
            date: localDate,
            preferences: GeneratePodcastRequest.Preferences(
                briefingTime: preferences.briefingTime ?? "07:00",
                topics: preferences.topics ?? [],
                voiceHost1: preferences.voiceHost1 ?? "nova",
                voiceHost2: preferences.voiceHost2 ?? "onyx",
                includeWeather: preferences.includeWeather ?? false,
                includeCalendar: preferences.includeCalendar ?? true,
                includeEmail: preferences.includeEmail ?? true,
                language: preferences.language ?? "en",
                includeTopicTeasers: preferences.includeTopicTeasers ?? true
            )
        )

        request.httpBody = try JSONEncoder().encode(requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NSError(domain: "PodcastService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
        }

        // 202 Accepted - job started
        if httpResponse.statusCode == 202 {
            let asyncResponse = try JSONDecoder().decode(AsyncGenerateResponse.self, from: data)
            return asyncResponse.jobId
        }

        // Error case
        if let errorResponse = try? JSONDecoder().decode(PodcastErrorResponse.self, from: data),
           let apiError = errorResponse.error {
            throw apiError
        }

        throw NSError(domain: "PodcastService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Failed to start generation"])
    }

    /// Poll job status
    func getJobStatus(jobId: String) async throws -> JobStatusResponse {
        let url = URL(string: "\(baseURL)/podcast/job/\(jobId)")!

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NSError(domain: "PodcastService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
        }

        if httpResponse.statusCode == 200 {
            return try JSONDecoder().decode(JobStatusResponse.self, from: data)
        }

        if httpResponse.statusCode == 404 {
            throw NSError(domain: "PodcastService", code: 404, userInfo: [NSLocalizedDescriptionKey: "Job not found or expired"])
        }

        throw NSError(domain: "PodcastService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Failed to get job status"])
    }

    /// Generate podcast with async polling - returns progress updates via callback
    /// This is the recommended method for production use.
    ///
    /// Routes to on-device Kokoro synthesis when:
    ///   1. The device is eligible (iOS 17+, ≥4 GB RAM)
    ///   2. The podcast language is English
    /// Otherwise falls through to the existing cloud TTS pipeline.
    func generatePodcastAsync(
        for userEmail: String,
        preferences: UserPreferences,
        onProgress: @escaping (Int, String) -> Void
    ) async throws -> GeneratePodcastResponse {
        if shouldUseOnDeviceSynthesis(for: preferences) {
            do {
                return try await generatePodcastOnDevice(
                    for: userEmail,
                    preferences: preferences,
                    onProgress: onProgress
                )
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                // Auth/content errors: surface immediately — re-running on cloud
                // would hit the same backend prerequisites with the same outcome.
                if let apiError = error as? PodcastAPIError,
                   apiError.isAuthError || apiError.isContentError {
                    throw apiError
                }
                // On-device synthesis itself failed (model download, OOM, etc.).
                // Fall back to the cloud pipeline so the user still gets audio.
                print("[PodcastService] On-device synthesis failed (\(error)); falling back to cloud TTS")
            }
        }

        // Start async job
        let jobId = try await startAsyncGeneration(for: userEmail, preferences: preferences)
        onProgress(5, "Starting generation...")

        // Poll for completion with exponential backoff
        var pollInterval: TimeInterval = 2.0  // Start with 2 seconds
        let maxPollInterval: TimeInterval = 10.0  // Cap at 10 seconds
        let maxWaitTime: TimeInterval = 360  // 6 minutes max
        let startTime = Date()
        var lastReportedProgress = 5  // Track last progress to avoid flickering

        while true {
            // Check if we've exceeded max wait time
            if Date().timeIntervalSince(startTime) > maxWaitTime {
                throw NSError(domain: "PodcastService", code: -4, userInfo: [
                    NSLocalizedDescriptionKey: "Generation timed out. Please try again."
                ])
            }

            // Wait before polling
            try await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))

            // Poll job status
            let status = try await getJobStatus(jobId: jobId)

            // Only update progress if it increased (prevents flickering back to 0)
            let effectiveProgress = max(status.progress, lastReportedProgress)
            if effectiveProgress > lastReportedProgress || status.status == "completed" || status.status == "failed" {
                lastReportedProgress = effectiveProgress
                onProgress(effectiveProgress, status.message)
            }

            switch status.status {
            case "completed":
                // Success - return the result
                guard let episode = status.episode else {
                    throw NSError(domain: "PodcastService", code: -5, userInfo: [NSLocalizedDescriptionKey: "No episode data in response"])
                }

                return GeneratePodcastResponse(
                    success: true,
                    episode: GeneratePodcastResponse.EpisodeInfo(
                        id: episode.id,
                        audioUrl: episode.audioUrl,
                        durationSeconds: episode.durationSeconds,
                        scriptSegments: episode.script?.totalSegments ?? 0
                    ),
                    costEstimate: GeneratePodcastResponse.CostEstimate(
                        scriptCostUsd: 0,
                        ttsCostUsd: 0,
                        totalCostUsd: 0
                    )
                )

            case "failed":
                // Failed - throw appropriate error
                if let jobError = status.error {
                    // Map to PodcastAPIError
                    let errorCode = PodcastErrorCode(rawValue: jobError.code) ?? .unknownError
                    let errorAction = PodcastErrorAction(rawValue: jobError.action) ?? .retry
                    throw PodcastAPIError(
                        code: errorCode,
                        message: jobError.message,
                        action: errorAction,
                        retryable: jobError.retryable,
                        details: nil
                    )
                }
                throw NSError(domain: "PodcastService", code: -6, userInfo: [NSLocalizedDescriptionKey: status.message])

            case "queued", "processing":
                // Still running - increase poll interval with exponential backoff
                pollInterval = min(pollInterval * 1.5, maxPollInterval)
                continue

            default:
                // Unknown status - keep polling
                continue
            }
        }
    }

    // MARK: - On-Device Synthesis (Kokoro)

    private struct ScriptOnlyResponse: Codable {
        let success: Bool
        let script: ScriptPayload?
        let title: String?
        let error: PodcastAPIError?
        let noContent: Bool?

        struct ScriptPayload: Codable {
            let segments: [Segment]
            let totalSegments: Int
            let language: String

            struct Segment: Codable {
                let speaker: String
                let text: String
                let type: String
            }
        }
    }

    private nonisolated func shouldUseOnDeviceSynthesis(for preferences: UserPreferences) -> Bool {
        let language = (preferences.language ?? "en").lowercased()
        guard language.hasPrefix("en") else { return false }
        guard KokoroModelManager.isDeviceEligible else { return false }
        return KokoroModelManager.isOnDeviceEnabledByUser
    }

    private func generatePodcastOnDevice(
        for userEmail: String,
        preferences: UserPreferences,
        onProgress: @escaping (Int, String) -> Void
    ) async throws -> GeneratePodcastResponse {
        onProgress(5, "Generating script…")

        let script = try await fetchScriptOnly(for: userEmail, preferences: preferences)
        guard !script.segments.isEmpty else {
            throw PodcastAPIError(
                code: .insufficientContent,
                message: "Not enough content to generate a podcast.",
                action: .none,
                retryable: false,
                details: nil
            )
        }

        onProgress(30, "Script ready. Synthesizing on device…")

        let host1 = preferences.voiceHost1 ?? "nova"
        let host2 = preferences.voiceHost2 ?? "onyx"

        let synthesizerSegments = script.segments.map { seg in
            KokoroPodcastSynthesizer.Segment(speaker: seg.speaker, text: seg.text)
        }

        let result = try await KokoroPodcastSynthesizer.shared.synthesize(
            segments: synthesizerSegments,
            host1Voice: host1,
            host2Voice: host2,
            progress: { progress in
                // Map synthesizer fraction (0..1) to the 30..95 range used by the
                // existing UI progress bar so cloud/on-device feel consistent.
                let scaled = 30 + Int(progress.fraction * 65)
                Task { @MainActor in onProgress(scaled, progress.message) }
            }
        )

        onProgress(100, "Complete")

        return GeneratePodcastResponse(
            success: true,
            episode: GeneratePodcastResponse.EpisodeInfo(
                id: "ondevice_\(UUID().uuidString)",
                audioUrl: result.fileURL.absoluteString,
                durationSeconds: Int(result.durationSeconds.rounded()),
                scriptSegments: script.segments.count
            ),
            costEstimate: GeneratePodcastResponse.CostEstimate(
                scriptCostUsd: 0,
                ttsCostUsd: 0,
                totalCostUsd: 0
            )
        )
    }

    private func fetchScriptOnly(
        for userEmail: String,
        preferences: UserPreferences
    ) async throws -> ScriptOnlyResponse.ScriptPayload {
        let url = URL(string: "\(baseURL)/podcast/script")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 90

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let localDate = dateFormatter.string(from: Date())

        let body = GeneratePodcastRequest(
            userId: userEmail,
            date: localDate,
            preferences: GeneratePodcastRequest.Preferences(
                briefingTime: preferences.briefingTime ?? "07:00",
                topics: preferences.topics ?? [],
                voiceHost1: preferences.voiceHost1 ?? "nova",
                voiceHost2: preferences.voiceHost2 ?? "onyx",
                includeWeather: preferences.includeWeather ?? false,
                includeCalendar: preferences.includeCalendar ?? true,
                includeEmail: preferences.includeEmail ?? true,
                language: preferences.language ?? "en",
                includeTopicTeasers: preferences.includeTopicTeasers ?? true
            )
        )
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await longRunningSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NSError(domain: "PodcastService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
        }

        if httpResponse.statusCode == 200 {
            let decoded = try JSONDecoder().decode(ScriptOnlyResponse.self, from: data)
            if let script = decoded.script {
                return script
            }
            if let error = decoded.error {
                throw error
            }
            throw NSError(domain: "PodcastService", code: -7, userInfo: [NSLocalizedDescriptionKey: "Empty script response"])
        }

        if let errorResponse = try? JSONDecoder().decode(PodcastErrorResponse.self, from: data),
           let apiError = errorResponse.error {
            throw apiError
        }
        throw NSError(domain: "PodcastService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Failed to generate script"])
    }
}
