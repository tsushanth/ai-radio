//
//  IMAAdManager.swift
//  BriefCast
//
//  Google IMA programmatic ad manager — fetches VAST ads from Google Ad Manager
//  and converts them to AdSegment for the existing ad playback system.
//
//  Priority chain:
//    1. Backend custom ads (direct-sold, higher CPM)
//    2. No custom ads → this manager fetches Google IMA ads
//    3. No fill → episode plays clean, no ads
//

import Foundation

@Observable
@MainActor
class IMAAdManager {
    static let shared = IMAAdManager()

    // Google IMA sample VAST tag (skippable preroll) — testing only
    // TODO: Replace with production Google Ad Manager audio ad unit tag
    private static let adTagURL =
        "https://pubads.g.doubleclick.net/gampad/ads?" +
        "iu=/21775744923/external/single_preroll_skippable&" +
        "sz=640x480&ciu_szs=300x250,728x90&" +
        "gdfp_req=1&output=vast&unviewed_position_start=1&" +
        "env=vp&impl=s&correlator="

    // Tracking URLs keyed by creative ID
    private var trackingStore: [String: VASTTracking] = [:]

    private init() {}

    // MARK: - Public API

    /// Request programmatic ads from Google IMA via VAST.
    /// Returns AdSegment list compatible with existing ad playback system.
    func requestAds(for topicId: String) async -> [AdSegment] {
        let correlator = Int(Date().timeIntervalSince1970)
        guard let url = URL(string: Self.adTagURL + "\(correlator)") else { return [] }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)

            guard let http = response as? HTTPURLResponse,
                  (200...299).contains(http.statusCode) else { return [] }

            let parser = VASTParser()
            let results = parser.parse(data)

            // Store tracking URLs for each ad
            for result in results {
                trackingStore[result.segment.creativeId] = result.tracking
            }

            return results.map(\.segment)
        } catch {
            print("[IMAAdManager] VAST request failed: \(error.localizedDescription)")
            return []
        }
    }

    /// Fire tracking pixels when ad starts playing
    func reportAdStarted(creativeId: String) {
        guard let tracking = trackingStore[creativeId] else { return }
        firePixels(tracking.impressionURLs)
        firePixels(tracking.trackingEvents["start"] ?? [])
        firePixels(tracking.trackingEvents["creativeView"] ?? [])
    }

    /// Fire tracking pixels when ad finishes
    func reportAdCompleted(creativeId: String) {
        firePixels(trackingStore[creativeId]?.trackingEvents["complete"] ?? [])
        trackingStore.removeValue(forKey: creativeId)
    }

    /// Fire tracking pixels when ad is skipped
    func reportAdSkipped(creativeId: String) {
        firePixels(trackingStore[creativeId]?.trackingEvents["skip"] ?? [])
        trackingStore.removeValue(forKey: creativeId)
    }

    /// Fire tracking pixels on ad click
    func reportAdClicked(creativeId: String) {
        firePixels(trackingStore[creativeId]?.clickTrackingURLs ?? [])
    }

    // MARK: - Helpers

    private func firePixels(_ urls: [String]) {
        for urlString in urls {
            guard let url = URL(string: urlString) else { continue }
            Task.detached(priority: .utility) {
                _ = try? await URLSession.shared.data(from: url)
            }
        }
    }
}

// MARK: - VAST Data Types

struct VASTTracking {
    var impressionURLs: [String] = []
    var trackingEvents: [String: [String]] = [:]  // event name -> [pixel URLs]
    var clickTrackingURLs: [String] = []
}

struct VASTParseResult {
    let segment: AdSegment
    let tracking: VASTTracking
}

// MARK: - VAST XML Parser

/// Parses VAST 2.0/3.0/4.0 XML responses into AdSegment objects
private class VASTParser: NSObject, XMLParserDelegate {
    private var results: [VASTParseResult] = []

    // Parse state
    private var currentAdId: String?
    private var currentCreativeId: String?
    private var currentDuration: Int = 0
    private var currentMediaUrl: String?
    private var currentCompanionImageUrl: String?
    private var currentClickThrough: String?
    private var currentTracking = VASTTracking()

    // XML state
    private var currentElement: String = ""
    private var currentText: String = ""
    private var currentTrackingEvent: String?
    private var inLinear = false
    private var inCompanion = false
    private var inMediaFiles = false
    private var companionWidth: Int = 0
    private var companionHeight: Int = 0

    func parse(_ data: Data) -> [VASTParseResult] {
        results = []
        let parser = XMLParser(data: data)
        parser.delegate = self
        parser.parse()
        return results
    }

    // MARK: - XMLParserDelegate

    func parser(_ parser: XMLParser, didStartElement elementName: String,
                namespaceURI: String?, qualifiedName: String?,
                attributes attributeDict: [String: String]) {
        currentElement = elementName
        currentText = ""

        switch elementName {
        case "Ad":
            currentAdId = attributeDict["id"]
            currentCreativeId = nil
            currentDuration = 0
            currentMediaUrl = nil
            currentCompanionImageUrl = nil
            currentClickThrough = nil
            currentTracking = VASTTracking()

        case "Creative":
            if let id = attributeDict["id"] {
                currentCreativeId = id
            }

        case "Linear":
            inLinear = true

        case "MediaFiles":
            inMediaFiles = true

        case "MediaFile":
            // Prefer audio formats; fall back to any
            if inMediaFiles {
                let mimeType = attributeDict["type"] ?? ""
                if currentMediaUrl == nil || mimeType.hasPrefix("audio/") {
                    // Will capture URL from character data
                }
            }

        case "Tracking":
            currentTrackingEvent = attributeDict["event"]

        case "Companion":
            inCompanion = true
            companionWidth = Int(attributeDict["width"] ?? "0") ?? 0
            companionHeight = Int(attributeDict["height"] ?? "0") ?? 0

        case "StaticResource":
            // Will capture URL from character data
            break

        default:
            break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        currentText += string
    }

    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        if let text = String(data: CDATABlock, encoding: .utf8) {
            currentText += text
        }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String,
                namespaceURI: String?, qualifiedName: String?) {
        let text = currentText.trimmingCharacters(in: .whitespacesAndNewlines)

        switch elementName {
        case "Duration":
            if inLinear {
                currentDuration = parseDuration(text)
            }

        case "MediaFile":
            if inMediaFiles && !text.isEmpty {
                // Prefer audio over video, but take what we get
                let isAudio = text.hasSuffix(".mp3") || text.hasSuffix(".m4a") || text.hasSuffix(".aac")
                if currentMediaUrl == nil || isAudio {
                    currentMediaUrl = text
                }
            }

        case "MediaFiles":
            inMediaFiles = false

        case "Linear":
            inLinear = false

        case "Impression":
            if !text.isEmpty {
                currentTracking.impressionURLs.append(text)
            }

        case "Tracking":
            if let event = currentTrackingEvent, !text.isEmpty {
                currentTracking.trackingEvents[event, default: []].append(text)
            }
            currentTrackingEvent = nil

        case "ClickThrough":
            if !text.isEmpty {
                currentClickThrough = text
            }

        case "ClickTracking":
            if !text.isEmpty {
                currentTracking.clickTrackingURLs.append(text)
            }

        case "StaticResource":
            if inCompanion && !text.isEmpty {
                // Prefer 300x250, accept any
                if currentCompanionImageUrl == nil ||
                    (companionWidth == 300 && companionHeight == 250) {
                    currentCompanionImageUrl = text
                }
            }

        case "Companion":
            inCompanion = false

        case "Ad":
            // Emit result if we have a media URL
            if let mediaUrl = currentMediaUrl, currentDuration > 0 {
                let creativeId = currentCreativeId ?? currentAdId ?? "ima_\(Int(Date().timeIntervalSince1970))"

                let segment = AdSegment(
                    type: "ima",
                    creativeId: creativeId,
                    campaignId: "google_ima",
                    audioUrl: mediaUrl,
                    audioDurationSeconds: currentDuration,
                    companionImageUrl: currentCompanionImageUrl,
                    clickThroughUrl: currentClickThrough,
                    ctaText: currentClickThrough != nil ? "Learn More" : nil
                )

                results.append(VASTParseResult(segment: segment, tracking: currentTracking))
            }

        default:
            break
        }

        currentText = ""
    }

    /// Parse VAST duration format "HH:MM:SS" or "HH:MM:SS.mmm" to seconds
    private func parseDuration(_ text: String) -> Int {
        let parts = text.split(separator: ":")
        guard parts.count == 3 else { return 0 }

        let hours = Int(parts[0]) ?? 0
        let minutes = Int(parts[1]) ?? 0
        let secondsPart = parts[2].split(separator: ".")
        let seconds = Int(secondsPart[0]) ?? 0

        return hours * 3600 + minutes * 60 + seconds
    }
}
