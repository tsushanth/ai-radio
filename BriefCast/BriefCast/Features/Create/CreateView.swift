//
//  CreateView.swift
//  BriefCast
//
//  Create new podcast episode view
//

import SwiftUI

struct CreateView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Colors.background
                    .ignoresSafeArea()

                VStack(spacing: 32) {
                    Spacer()

                    // Icon
                    Image(systemName: "waveform.badge.plus")
                        .font(.system(size: 80))
                        .foregroundColor(Theme.Colors.accent)

                    // Title
                    Text("Create Daily Brief")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(Theme.Colors.primaryText)

                    // Description
                    Text("Generate your personalized podcast from today's emails and calendar events")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundColor(Theme.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)

                    // Generate button
                    Button(action: {
                        // TODO: Implement podcast generation
                        print("Generate podcast")
                    }) {
                        HStack(spacing: 12) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 18, weight: .semibold))

                            Text("Generate Now")
                                .font(.system(size: 18, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(Theme.Colors.accent)
                        .cornerRadius(16)
                    }
                    .padding(.horizontal, 32)
                    .padding(.top, 16)

                    Spacer()
                }
            }
            .navigationTitle("Create")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(Theme.Colors.secondaryText)
                    }
                }
            }
        }
    }
}

#Preview {
    CreateView()
}
