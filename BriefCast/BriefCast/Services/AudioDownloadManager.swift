//
//  AudioDownloadManager.swift
//  BriefCast
//
//  Manages downloading and caching audio files locally for reliable playback
//

import Foundation

actor AudioDownloadManager {
    static let shared = AudioDownloadManager()

    // MARK: - Properties

    private let fileManager = FileManager.default
    private var activeDownloads: [String: Task<URL, Error>] = [:]

    /// Directory for cached audio files
    private var cacheDirectory: URL {
        let paths = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)
        let audioCache = paths[0].appendingPathComponent("AudioCache", isDirectory: true)

        // Create directory if it doesn't exist
        if !fileManager.fileExists(atPath: audioCache.path) {
            try? fileManager.createDirectory(at: audioCache, withIntermediateDirectories: true)
        }

        return audioCache
    }

    // MARK: - Public Methods

    /// Get local file URL for an episode, downloading if necessary
    /// - Parameters:
    ///   - remoteUrl: The remote URL of the audio file
    ///   - episodeId: Unique identifier for the episode (used for caching)
    ///   - onProgress: Optional progress callback (0.0 to 1.0)
    /// - Returns: Local file URL for playback
    func getLocalAudioURL(
        for remoteUrl: URL,
        episodeId: String,
        onProgress: ((Double) -> Void)? = nil
    ) async throws -> URL {
        let localURL = localFileURL(for: episodeId)

        // Check if already downloaded
        if fileManager.fileExists(atPath: localURL.path) {
            print("🎵 AudioDownloadManager: Using cached file for episode \(episodeId)")
            return localURL
        }

        // Check if download is already in progress
        if let existingTask = activeDownloads[episodeId] {
            print("🎵 AudioDownloadManager: Waiting for existing download for episode \(episodeId)")
            return try await existingTask.value
        }

        // Start new download
        print("🎵 AudioDownloadManager: Starting download for episode \(episodeId)")
        let downloadTask = Task<URL, Error> {
            try await downloadAudio(from: remoteUrl, to: localURL, onProgress: onProgress)
        }

        activeDownloads[episodeId] = downloadTask

        do {
            let result = try await downloadTask.value
            activeDownloads.removeValue(forKey: episodeId)
            return result
        } catch {
            activeDownloads.removeValue(forKey: episodeId)
            throw error
        }
    }

    /// Check if an episode's audio is already downloaded
    func isDownloaded(episodeId: String) -> Bool {
        let localURL = localFileURL(for: episodeId)
        return fileManager.fileExists(atPath: localURL.path)
    }

    /// Get local file URL for an episode (without downloading)
    func localFileURL(for episodeId: String) -> URL {
        // Sanitize episodeId for use as filename
        let safeId = episodeId.replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: ":", with: "_")
        return cacheDirectory.appendingPathComponent("\(safeId).mp3")
    }

    /// Delete cached audio for an episode
    func deleteCachedAudio(for episodeId: String) {
        let localURL = localFileURL(for: episodeId)
        try? fileManager.removeItem(at: localURL)
        print("🎵 AudioDownloadManager: Deleted cached audio for episode \(episodeId)")
    }

    /// Clear all cached audio files
    func clearAllCache() {
        try? fileManager.removeItem(at: cacheDirectory)
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
        print("🎵 AudioDownloadManager: Cleared all audio cache")
    }

    /// Get total size of cached audio files
    func getCacheSize() -> Int64 {
        guard let enumerator = fileManager.enumerator(at: cacheDirectory, includingPropertiesForKeys: [.fileSizeKey]) else {
            return 0
        }

        var totalSize: Int64 = 0
        for case let fileURL as URL in enumerator {
            if let resourceValues = try? fileURL.resourceValues(forKeys: [.fileSizeKey]),
               let fileSize = resourceValues.fileSize {
                totalSize += Int64(fileSize)
            }
        }

        return totalSize
    }

    /// Format cache size for display
    func formattedCacheSize() -> String {
        let bytes = getCacheSize()
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useAll]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }

    // MARK: - Private Methods

    private func downloadAudio(
        from remoteUrl: URL,
        to localURL: URL,
        onProgress: ((Double) -> Void)?
    ) async throws -> URL {
        // Create a download task with progress tracking
        let (asyncBytes, response) = try await URLSession.shared.bytes(from: remoteUrl)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw AudioDownloadError.downloadFailed("Server returned error")
        }

        let expectedLength = response.expectedContentLength
        var downloadedData = Data()
        downloadedData.reserveCapacity(expectedLength > 0 ? Int(expectedLength) : 1024 * 1024)

        var downloadedBytes: Int64 = 0

        for try await byte in asyncBytes {
            downloadedData.append(byte)
            downloadedBytes += 1

            // Report progress periodically (every 10KB to avoid too many updates)
            if downloadedBytes % 10240 == 0 && expectedLength > 0 {
                let progress = Double(downloadedBytes) / Double(expectedLength)
                await MainActor.run {
                    onProgress?(progress)
                }
            }
        }

        // Final progress update
        await MainActor.run {
            onProgress?(1.0)
        }

        // Write to local file
        try downloadedData.write(to: localURL)

        print("🎵 AudioDownloadManager: Downloaded \(downloadedBytes) bytes to \(localURL.lastPathComponent)")

        return localURL
    }
}

// MARK: - Errors

enum AudioDownloadError: LocalizedError {
    case downloadFailed(String)
    case fileWriteFailed(String)

    var errorDescription: String? {
        switch self {
        case .downloadFailed(let message):
            return "Download failed: \(message)"
        case .fileWriteFailed(let message):
            return "Failed to save audio: \(message)"
        }
    }
}
