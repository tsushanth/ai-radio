//
//  SkeletonViews.swift
//  BriefCast
//
//  Skeleton loading components for various UI elements
//

import SwiftUI

// MARK: - Skeleton Show Card

struct SkeletonShowCard: View {
    let size: ShowCardSize

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Image skeleton
            Rectangle()
                .fill(Color.gray.opacity(0.3))
                .frame(height: size.imageHeight)
                .cornerRadius(16, corners: [.topLeft, .topRight])

            // Content skeleton
            VStack(alignment: .leading, spacing: 8) {
                // Title skeleton
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: size.width * 0.8, height: size == .large ? 18 : 16)

                // Description skeleton
                VStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.gray.opacity(0.3))
                        .frame(width: size.width * 0.9, height: 14)

                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.gray.opacity(0.3))
                        .frame(width: size.width * 0.6, height: 14)
                }

                // Episode info skeleton
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: size.width * 0.5, height: 12)
            }
            .padding(12)
        }
        .frame(width: size.width)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(16)
        .shimmer()
    }
}

// MARK: - Skeleton Episode Row

struct SkeletonEpisodeRow: View {
    var body: some View {
        HStack(spacing: 12) {
            // Thumbnail skeleton
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.gray.opacity(0.3))
                .frame(width: 60, height: 60)

            VStack(alignment: .leading, spacing: 8) {
                // Title skeleton
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.gray.opacity(0.3))
                    .frame(height: 16)

                // Description skeleton
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 200, height: 14)

                // Info skeleton
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 120, height: 12)
            }

            Spacer()

            // Play button skeleton
            Circle()
                .fill(Color.gray.opacity(0.3))
                .frame(width: 44, height: 44)
        }
        .padding()
        .background(Theme.Colors.cardBackground)
        .cornerRadius(12)
        .shimmer()
    }
}

// MARK: - Skeleton Category Row

struct SkeletonCategoryRow: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Category title skeleton
            HStack(spacing: 8) {
                Circle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 24, height: 24)

                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 120, height: 20)

                Spacer()
            }
            .padding(.horizontal, 16)

            // Cards skeleton
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 16) {
                    ForEach(0..<3) { _ in
                        SkeletonShowCard(size: .small)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}

// MARK: - Skeleton Header

struct SkeletonHeader: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Greeting skeleton
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.white.opacity(0.3))
                .frame(width: 100, height: 24)

            // Name skeleton
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.white.opacity(0.3))
                .frame(width: 180, height: 32)

            // Subtitle skeleton
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.white.opacity(0.3))
                .frame(width: 220, height: 18)

            Spacer()
                .frame(height: 24)

            // Play button skeleton
            RoundedRectangle(cornerRadius: 28)
                .fill(Color.white.opacity(0.3))
                .frame(width: 160, height: 56)
        }
        .padding(.horizontal, 16)
        .frame(height: 280)
        .shimmer()
    }
}

// MARK: - Skeleton List

struct SkeletonList: View {
    let count: Int

    var body: some View {
        VStack(spacing: 12) {
            ForEach(0..<count, id: \.self) { _ in
                SkeletonEpisodeRow()
            }
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - Loading States View

struct LoadingStateView: View {
    let message: String

    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: Theme.Colors.accent))
                .scaleEffect(1.5)

            Text(message)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(Theme.Colors.secondaryText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.background)
    }
}

// MARK: - Empty State View

struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String
    let actionTitle: String?
    let action: (() -> Void)?

    init(
        icon: String = "tray",
        title: String,
        message: String,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.icon = icon
        self.title = title
        self.message = message
        self.actionTitle = actionTitle
        self.action = action
    }

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: icon)
                .font(.system(size: 60))
                .foregroundColor(Theme.Colors.secondaryText)

            VStack(spacing: 8) {
                Text(title)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(Theme.Colors.primaryText)

                Text(message)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let actionTitle = actionTitle, let action = action {
                Button(action: action) {
                    Text(actionTitle)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 32)
                        .padding(.vertical, 12)
                        .background(Theme.Colors.accent)
                        .cornerRadius(12)
                }
                .padding(.top, 8)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.background)
    }
}

// MARK: - Previews

#Preview("Skeleton Show Cards") {
    ScrollView(.horizontal) {
        HStack(spacing: 16) {
            SkeletonShowCard(size: .large)
            SkeletonShowCard(size: .small)
            SkeletonShowCard(size: .small)
        }
        .padding()
    }
    .background(Theme.Colors.background)
}

#Preview("Skeleton List") {
    ScrollView {
        SkeletonList(count: 5)
    }
    .background(Theme.Colors.background)
}

#Preview("Empty State") {
    EmptyStateView(
        icon: "music.note.list",
        title: "No Episodes Yet",
        message: "Your personalized episodes will appear here once they're generated",
        actionTitle: "Generate Now",
        action: { print("Action tapped") }
    )
}

#Preview("Loading State") {
    LoadingStateView(message: "Generating your briefing...")
}
