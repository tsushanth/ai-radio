//
//  LiveStationCard.swift
//  BriefCast
//
//  Card component for displaying a live station
//

import SwiftUI

struct LiveStationCard: View {
    let station: LiveStation
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 12) {
                // Header with icon and live badge
                HStack {
                    // Station icon
                    ZStack {
                        Circle()
                            .fill(station.swiftUIColor.opacity(0.2))
                            .frame(width: 44, height: 44)

                        Image(systemName: station.systemImage)
                            .font(.system(size: 20))
                            .foregroundColor(station.swiftUIColor)
                    }

                    Spacer()

                    // Live badge
                    if station.isLive {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(.red)
                                .frame(width: 6, height: 6)
                                .modifier(PulsingAnimation())

                            Text("LIVE")
                                .font(.caption2)
                                .fontWeight(.bold)
                                .foregroundColor(.red)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.red.opacity(0.1))
                        .cornerRadius(12)
                    }
                }

                // Station name
                Text(station.name)
                    .font(.headline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                    .lineLimit(1)

                // Description
                Text(station.description)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)

                Spacer()

                // Footer
                HStack {
                    // Listener count
                    if station.listenerCount > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "headphones")
                                .font(.caption2)
                            Text(station.formattedListenerCount)
                                .font(.caption2)
                        }
                        .foregroundColor(.secondary)
                    }

                    Spacer()

                    // Category
                    Text(station.category.displayName)
                        .font(.caption2)
                        .foregroundColor(station.swiftUIColor)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(station.swiftUIColor.opacity(0.1))
                        .cornerRadius(4)
                }
            }
            .padding(16)
            .frame(width: 180, height: 180)
            .background(Color(.systemBackground))
            .cornerRadius(16)
            .shadow(color: .black.opacity(0.1), radius: 8, x: 0, y: 4)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Pulsing Animation

struct PulsingAnimation: ViewModifier {
    @State private var isPulsing = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(isPulsing ? 1.2 : 1.0)
            .opacity(isPulsing ? 0.5 : 1.0)
            .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true), value: isPulsing)
            .onAppear {
                isPulsing = true
            }
    }
}

// MARK: - Preview

#Preview {
    HStack(spacing: 16) {
        LiveStationCard(station: .preview, onTap: {})
        LiveStationCard(station: .previewTech, onTap: {})
    }
    .padding()
    .background(Color(.systemGroupedBackground))
}
