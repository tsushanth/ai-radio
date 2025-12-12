//
//  SearchBar.swift
//  BriefCast
//
//  Rounded search input with minimal dark theme style
//

import SwiftUI

struct SearchBar: View {
    @Binding var text: String
    let placeholder: String
    @FocusState private var isFocused: Bool

    init(text: Binding<String>, placeholder: String = "Find new shows") {
        self._text = text
        self.placeholder = placeholder
    }

    var body: some View {
        HStack(spacing: 12) {
            // Search icon
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(isFocused ? Theme.Colors.accent : Theme.Colors.secondaryText)
                .animation(.easeInOut(duration: 0.2), value: isFocused)

            // Text field
            TextField(placeholder, text: $text)
                .font(.system(size: 16, weight: .regular))
                .foregroundColor(Theme.Colors.primaryText)
                .autocapitalization(.none)
                .autocorrectionDisabled()
                .focused($isFocused)
                .tint(Theme.Colors.accent)

            // Clear button (only shown when text is not empty)
            if !text.isEmpty {
                Button(action: {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        text = ""
                    }
                }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundColor(Theme.Colors.secondaryText)
                }
                .transition(.scale.combined(with: .opacity))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(hex: "#2C2C2E"))  // Slightly lighter than card background
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(
                            isFocused ? Theme.Colors.accent.opacity(0.5) : Color.clear,
                            lineWidth: 1
                        )
                )
        )
        .animation(.easeInOut(duration: 0.2), value: isFocused)
    }
}

#Preview {
    @Previewable @State var searchText = ""
    @Previewable @State var filledText = "Tech News"

    VStack(spacing: 24) {
        // Empty state
        SearchBar(text: $searchText)

        // Filled state
        SearchBar(text: $filledText, placeholder: "Search podcasts...")

        // Custom placeholder
        SearchBar(text: $searchText, placeholder: "What are you looking for?")

        Spacer()
    }
    .padding()
    .background(Theme.Colors.background)
}
