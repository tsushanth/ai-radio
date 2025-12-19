//
//  CategoryRow.swift
//  BriefCast
//
//  Horizontal scrolling category component with snap scrolling
//

import SwiftUI

struct CategoryRow: View {
    let title: String
    let shows: [Show]
    var onShowTap: ((Show) -> Void)?
    var isShowBookmarked: ((Show) -> Bool)?
    var onBookmarkToggle: ((Show) -> Void)?
    var onHide: ((Show) -> Void)?

    init(
        title: String,
        shows: [Show],
        onShowTap: ((Show) -> Void)? = nil,
        isShowBookmarked: ((Show) -> Bool)? = nil,
        onBookmarkToggle: ((Show) -> Void)? = nil,
        onHide: ((Show) -> Void)? = nil
    ) {
        self.title = title
        self.shows = shows
        self.onShowTap = onShowTap
        self.isShowBookmarked = isShowBookmarked
        self.onBookmarkToggle = onBookmarkToggle
        self.onHide = onHide
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Title with trend icon
            HStack(spacing: 8) {
                Text(title)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(Theme.Colors.primaryText)

                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Theme.Colors.accent)
            }
            .padding(.horizontal, Theme.Spacing.screenPadding)

            // Horizontal scrolling show cards
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 16) {
                    ForEach(shows) { show in
                        ShowCard(
                            title: show.title,
                            description: show.description,
                            imageColor: Color(hex: show.imageColor),
                            episodeInfo: "\(show.episodeCount) min daily",
                            size: .small,
                            isBookmarked: isShowBookmarked?(show) ?? false,
                            onTap: {
                                onShowTap?(show)
                            },
                            onBookmarkTap: {
                                onBookmarkToggle?(show)
                            },
                            onHide: onHide != nil ? { onHide?(show) } : nil
                        )
                    }
                }
                .padding(.horizontal, Theme.Spacing.screenPadding)
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
        }
    }

    // Helper to assign colors based on category
    private func getColorForCategory(_ category: String) -> Color {
        switch category.lowercased() {
        case "technology", "tech":
            return Color(hex: "#4A90E2")
        case "business":
            return Color(hex: "#E24A90")
        case "health":
            return Color(hex: "#50C878")
        case "news":
            return Color(hex: "#FF6B35")
        default:
            return Theme.Colors.accent
        }
    }
}

#Preview {
    CategoryRow(
        title: "Tech",
        shows: [
            Show(
                id: "1",
                title: "Tech News Daily",
                description: "Latest updates from the tech world",
                category: "Technology",
                imageUrl: nil,
                imageColor: "#4A90E2",
                episodeCount: 42,
                isSubscribed: true,
                publisher: "TechCast Network",
                rating: 4.7
            ),
            Show(
                id: "2",
                title: "AI Insights",
                description: "Deep dive into artificial intelligence",
                category: "Technology",
                imageUrl: nil,
                imageColor: "#9B59B6",
                episodeCount: 28,
                isSubscribed: false,
                publisher: "AI Insider",
                rating: 4.9
            ),
            Show(
                id: "3",
                title: "Startup Stories",
                description: "Behind the scenes of tech startups",
                category: "Business",
                imageUrl: nil,
                imageColor: "#50C878",
                episodeCount: 35,
                isSubscribed: true,
                publisher: "Founder's Hub",
                rating: 4.6
            ),
            Show(
                id: "4",
                title: "Code & Coffee",
                description: "Programming tips and tricks",
                category: "Technology",
                imageUrl: nil,
                imageColor: "#3498DB",
                episodeCount: 56,
                isSubscribed: false,
                publisher: "CodeCast",
                rating: 4.8
            )
        ]
    )
    .background(Theme.Colors.background)
}
