//
//  GradientHeader.swift
//  BriefCast
//
//  Warm gradient hero section component with play button
//

import SwiftUI

struct GradientHeader: View {
    let greeting: String
    let userName: String
    let subtitle: String
    let briefState: DailyBriefState
    let hasCachedEpisode: Bool
    let onPlayTapped: () -> Void
    let onPauseTapped: () -> Void
    let onLinkAccountTapped: () -> Void
    let onRegenerateTapped: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    init(
        greeting: String,
        userName: String,
        subtitle: String,
        briefState: DailyBriefState = .ready,
        hasCachedEpisode: Bool = false,
        onPlayTapped: @escaping () -> Void = {},
        onPauseTapped: @escaping () -> Void = {},
        onLinkAccountTapped: @escaping () -> Void = {},
        onRegenerateTapped: @escaping () -> Void = {}
    ) {
        self.greeting = greeting
        self.userName = userName
        self.subtitle = subtitle
        self.briefState = briefState
        self.hasCachedEpisode = hasCachedEpisode
        self.onPlayTapped = onPlayTapped
        self.onPauseTapped = onPauseTapped
        self.onLinkAccountTapped = onLinkAccountTapped
        self.onRegenerateTapped = onRegenerateTapped
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            // Gradient background - solid warm gradient that works in both modes
            LinearGradient(
                colors: [
                    Color(hex: "#8B4513"),  // saddle brown
                    Color(hex: "#D2691E"),  // chocolate
                    Color(hex: "#FF8C00"),  // dark orange
                    Color(hex: "#CC7000")   // darker orange at bottom for text contrast
                ],
                startPoint: .topLeading,
                endPoint: .bottom
            )
            .frame(height: 320)

            VStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 12) {
                    // Subtitle above greeting
                    Text(subtitle)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Theme.Colors.primaryText.opacity(0.7))

                    // Greeting with user name
                    VStack(alignment: .leading, spacing: 4) {
                        Text(greeting)
                            .font(.system(size: 36, weight: .bold))
                            .foregroundColor(Theme.Colors.primaryText)

                        if !userName.isEmpty {
                            Text(userName)
                                .font(.system(size: 36, weight: .bold))
                                .foregroundColor(Theme.Colors.primaryText)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.screenPadding)

                // Action button based on state
                briefActionView
                    .padding(.horizontal, Theme.Spacing.screenPadding)
            }
            .padding(.bottom, 32)
        }
        .frame(height: 320)
    }

    @ViewBuilder
    private var briefActionView: some View {
        switch briefState {
        case .notLinked:
            // Show link account prompt
            LinkAccountPromptButton(onTap: onLinkAccountTapped)

        case .ready:
            // Show generate button
            GenerateBriefButton(onTap: onPlayTapped)

        case .generating(let progress):
            // Show progress
            GeneratingProgressView(progress: progress)

        case .completed(_):
            // Show play button with optional regenerate
            PlayButton(
                onTap: onPlayTapped,
                showRegenerateOption: hasCachedEpisode,
                onRegenerateTap: onRegenerateTapped
            )

        case .playing(_):
            // Show now playing indicator with pause action
            NowPlayingView(onPauseTapped: onPauseTapped)

        case .error(let message):
            // Show error with retry
            ErrorRetryView(message: message, onRetry: onPlayTapped)

        case .needsRelink(let message):
            // Show relink account prompt
            RelinkAccountPromptView(message: message, onRelink: onLinkAccountTapped)

        case .noContent(let message):
            // Show no content message
            NoContentView(message: message, onRetry: onPlayTapped)
        }
    }
}

// MARK: - Link Account Prompt Button

struct LinkAccountPromptButton: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Image(systemName: "link.badge.plus")
                    .font(.system(size: 20, weight: .semibold))

                VStack(alignment: .leading, spacing: 2) {
                    Text("Connect your email")
                        .font(.system(size: 16, weight: .semibold))
                    Text("to generate your personalized brief")
                        .font(.system(size: 12, weight: .regular))
                        .opacity(0.8)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white.opacity(0.15))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.white.opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(ScaleButtonStyle())
    }
}

// MARK: - Generate Brief Button

struct GenerateBriefButton: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Image(systemName: "waveform.circle.fill")
                    .font(.system(size: 24, weight: .semibold))

                Text("Generate Today's Brief")
                    .font(.system(size: 18, weight: .semibold))

                Spacer()

                Image(systemName: "arrow.right.circle.fill")
                    .font(.system(size: 24))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Theme.Colors.accent)
            )
        }
        .buttonStyle(ScaleButtonStyle())
    }
}

// MARK: - Generating Progress View

struct GeneratingProgressView: View {
    let progress: Int

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))

                VStack(alignment: .leading, spacing: 2) {
                    Text("Generating your brief...")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)

                    Text(progressMessage)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(.white.opacity(0.8))
                }

                Spacer()

                Text("\(progress)%")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white.opacity(0.15))
            )

            // Progress bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.white.opacity(0.2))
                        .frame(height: 4)

                    RoundedRectangle(cornerRadius: 4)
                        .fill(Theme.Colors.accent)
                        .frame(width: geometry.size.width * CGFloat(progress) / 100, height: 4)
                        .animation(.easeInOut(duration: 0.3), value: progress)
                }
            }
            .frame(height: 4)
        }
    }

    private var progressMessage: String {
        switch progress {
        case 0..<20: return "Fetching your emails and calendar..."
        case 20..<50: return "Analyzing content..."
        case 50..<80: return "Creating your personalized script..."
        case 80..<95: return "Generating audio..."
        default: return "Almost done..."
        }
    }
}

// MARK: - Now Playing View

struct NowPlayingView: View {
    let onPauseTapped: () -> Void
    @State private var animateWave = false

    init(onPauseTapped: @escaping () -> Void = {}) {
        self.onPauseTapped = onPauseTapped
    }

    var body: some View {
        HStack(spacing: 12) {
            // Animated waveform
            HStack(spacing: 3) {
                ForEach(0..<5) { index in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.white)
                        .frame(width: 4, height: animateWave ? CGFloat.random(in: 8...24) : 8)
                        .animation(
                            Animation.easeInOut(duration: 0.4)
                                .repeatForever()
                                .delay(Double(index) * 0.1),
                            value: animateWave
                        )
                }
            }
            .onAppear { animateWave = true }

            Text("Now Playing")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)

            Spacer()

            Button(action: {
                HapticManager.shared.medium()
                onPauseTapped()
            }) {
                Image(systemName: "pause.circle.fill")
                    .font(.system(size: 32))
                    .foregroundColor(.white)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Theme.Colors.accent)
        )
    }
}

// MARK: - Error Retry View

struct ErrorRetryView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        Button(action: onRetry) {
            HStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(.orange)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Generation failed")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)

                    Text(message)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(.white.opacity(0.7))
                        .lineLimit(1)
                }

                Spacer()

                Text("Retry")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Theme.Colors.accent)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white.opacity(0.1))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.orange.opacity(0.5), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(ScaleButtonStyle())
    }
}

// MARK: - Relink Account Prompt View

struct RelinkAccountPromptView: View {
    let message: String
    let onRelink: () -> Void

    var body: some View {
        Button(action: onRelink) {
            HStack(spacing: 12) {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.yellow)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Reconnect your email")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)

                    Text(message)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(.white.opacity(0.7))
                        .lineLimit(2)
                }

                Spacer()

                Text("Reconnect")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Theme.Colors.accent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Theme.Colors.accent.opacity(0.2))
                    )
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white.opacity(0.1))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.yellow.opacity(0.5), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(ScaleButtonStyle())
    }
}

// MARK: - No Content View

struct NoContentView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "tray")
                    .font(.system(size: 20))
                    .foregroundColor(.blue)

                VStack(alignment: .leading, spacing: 2) {
                    Text("No new emails")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)

                    Text(message)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(.white.opacity(0.7))
                        .lineLimit(2)
                }

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white.opacity(0.1))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                    )
            )

            // Retry button below
            Button(action: onRetry) {
                Text("Try Again Later")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
            }
        }
    }
}

#Preview {
    VStack(spacing: 20) {
        GradientHeader(
            greeting: "Good Morning",
            userName: "Sushanth",
            subtitle: "Daily Brief • December 10, 2025",
            briefState: .ready
        ) {
            print("Play tapped")
        } onLinkAccountTapped: {
            print("Link account tapped")
        }
    }
    .background(Theme.Colors.background)
}
