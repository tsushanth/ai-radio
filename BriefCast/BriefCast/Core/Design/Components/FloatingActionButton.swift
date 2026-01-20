//
//  FloatingActionButton.swift
//  BriefCast
//
//  Reusable floating action button component
//

import SwiftUI

struct FloatingActionButton: View {
    let icon: String
    let color: Color
    let action: () -> Void

    @State private var isPressed: Bool = false
    @State private var showPulse: Bool = false

    var body: some View {
        Button(action: {
            HapticManager.shared.medium()
            action()
        }) {
            ZStack {
                // Pulse animation (for onboarding)
                if showPulse {
                    Circle()
                        .stroke(color.opacity(0.3), lineWidth: 2)
                        .frame(width: 70, height: 70)
                        .scaleEffect(showPulse ? 1.3 : 1.0)
                        .opacity(showPulse ? 0 : 1)
                        .animation(
                            Animation.easeOut(duration: 1.5)
                                .repeatForever(autoreverses: false),
                            value: showPulse
                        )
                }

                // Shadow
                Circle()
                    .fill(color)
                    .frame(width: 56, height: 56)
                    .shadow(color: color.opacity(0.4), radius: 8, x: 0, y: 4)

                // Icon
                Image(systemName: icon)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundColor(.white)
            }
            .scaleEffect(isPressed ? 0.9 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: isPressed)
        }
        .buttonStyle(PlainButtonStyle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in isPressed = true }
                .onEnded { _ in isPressed = false }
        )
    }

    // MARK: - Modifiers

    func pulse(_ enabled: Bool = true) -> some View {
        var view = self
        view.showPulse = enabled
        return view
    }
}

// MARK: - Deep Dive FAB

struct DeepDiveFAB: View {
    let action: () -> Void

    var body: some View {
        FloatingActionButton(
            icon: "plus",
            color: Color(hex: DeepDiveEpisode.brandColor),
            action: action
        )
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()

        VStack {
            Spacer()

            HStack {
                Spacer()

                DeepDiveFAB {
                    print("FAB tapped")
                }
                .padding(.trailing, 20)
                .padding(.bottom, 100)
            }
        }
    }
}
