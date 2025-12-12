//
//  ShowCard.swift
//  BriefCast
//
//  Podcast/show card component with bookmark and menu
//

import SwiftUI

enum ShowCardSize {
    case large  // 280pt width
    case small  // 160pt width

    var width: CGFloat {
        switch self {
        case .large: return 280
        case .small: return 160
        }
    }

    var imageHeight: CGFloat {
        switch self {
        case .large: return width * 0.75  // 4:3 aspect ratio
        case .small: return width * 0.75
        }
    }
}

struct ShowCard: View {
    let title: String
    let description: String
    let imageColor: Color
    let episodeInfo: String?
    let size: ShowCardSize
    let isBookmarked: Bool
    let onTap: () -> Void
    let onBookmarkTap: () -> Void
    let onMenuTap: () -> Void

    @State private var isPressed = false

    init(
        title: String,
        description: String,
        imageColor: Color = Theme.Colors.accent,
        episodeInfo: String? = nil,
        size: ShowCardSize = .large,
        isBookmarked: Bool = false,
        onTap: @escaping () -> Void = {},
        onBookmarkTap: @escaping () -> Void = {},
        onMenuTap: @escaping () -> Void = {}
    ) {
        self.title = title
        self.description = description
        self.imageColor = imageColor
        self.episodeInfo = episodeInfo
        self.size = size
        self.isBookmarked = isBookmarked
        self.onTap = onTap
        self.onBookmarkTap = onBookmarkTap
        self.onMenuTap = onMenuTap
    }

    var body: some View {
        Button(action: {
            HapticManager.shared.light()
            onTap()
        }) {
            cardContent
        }
        .buttonStyle(PlainButtonStyle())
        .scaleEffect(isPressed ? 0.97 : 1.0)
        .brightness(isPressed ? -0.05 : 0)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isPressed)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if !isPressed {
                        isPressed = true
                    }
                }
                .onEnded { _ in
                    isPressed = false
                }
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(description)")
        .accessibilityHint("Double tap to view details")
    }

    private var cardContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Image/color area (4:3 aspect ratio)
            ZStack(alignment: .topTrailing) {
                imageColor
                    .frame(height: size.imageHeight)

                // Waveform icon overlay
                Image(systemName: "waveform")
                    .font(.system(size: 40, weight: .light))
                    .foregroundColor(.white.opacity(0.3))
            }
            .cornerRadius(16, corners: [.topLeft, .topRight])

            // Content area
            VStack(alignment: .leading, spacing: 8) {
                // Title
                Text(title)
                    .font(.system(size: size == .large ? 18 : 16, weight: .semibold))
                    .foregroundColor(Theme.Colors.primaryText)
                    .lineLimit(2)

                // Description
                Text(description)
                    .font(.system(size: size == .large ? 14 : 12, weight: .regular))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .lineLimit(2)

                // Episode info (if provided)
                if let episodeInfo = episodeInfo {
                    Text(episodeInfo)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(Theme.Colors.secondaryText.opacity(0.7))
                }

                // Bottom row with bookmark and menu
                HStack {
                    Spacer()

                    // Bookmark button
                    Button(action: {
                        HapticManager.shared.light()
                        onBookmarkTap()
                    }) {
                        Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                            .font(.system(size: 16))
                            .foregroundColor(isBookmarked ? Theme.Colors.accent : Theme.Colors.secondaryText)
                            .contentTransition(.symbolEffect(.replace))
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel(isBookmarked ? "Remove bookmark" : "Add bookmark")

                    // Menu button
                    Button(action: {
                        HapticManager.shared.light()
                        onMenuTap()
                    }) {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(Theme.Colors.secondaryText)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Show more options")
                }
                .padding(.top, 4)
            }
            .padding(12)
        }
        .frame(width: size.width)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(16)
    }
}

// Extension to round specific corners
extension View {
    func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCorner(radius: radius, corners: corners))
    }
}

struct RoundedCorner: Shape {
    var radius: CGFloat = .infinity
    var corners: UIRectCorner = .allCorners

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: corners,
            cornerRadii: CGSize(width: radius, height: radius)
        )
        return Path(path.cgPath)
    }
}

#Preview {
    ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 16) {
            // Large card
            ShowCard(
                title: "Your Morning Briefing",
                description: "Today's schedule, emails, and news summary for December 10",
                imageColor: Color(hex: "#FF6B35"),
                episodeInfo: "Episode #1 • December 10, 2025",
                size: .large,
                isBookmarked: true
            )

            // Small card
            ShowCard(
                title: "Tech News Daily",
                description: "Latest updates from the tech world",
                imageColor: Color(hex: "#4A90E2"),
                episodeInfo: "Episode #42",
                size: .small,
                isBookmarked: false
            )

            // Another small card
            ShowCard(
                title: "Business Brief",
                description: "Market insights and trends",
                imageColor: Color(hex: "#E24A90"),
                size: .small
            )
        }
        .padding()
    }
    .background(Theme.Colors.background)
}
