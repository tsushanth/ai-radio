//
//  DiscoverView.swift
//  BriefCast
//
//  Discover screen view
//

import SwiftUI

struct DiscoverView: View {
    @StateObject private var viewModel = DiscoverViewModel()
    @State private var selectedTab = 0

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.sectionSpacing) {
                // Search bar
                SearchBar(text: $viewModel.searchText)
                    .padding(.horizontal, Theme.Spacing.screenPadding)
                    .padding(.top, 16)

                // Tab selector
                TabSelector(selectedTab: $selectedTab, tabs: ["For You", "Discover"])
                    .padding(.horizontal, Theme.Spacing.screenPadding)

                // Categories - render each category as a row
                ForEach(viewModel.categories) { category in
                    CategoryRow(title: category.name, shows: category.shows)
                }

                // Shows
                VStack(alignment: .leading, spacing: 12) {
                    Text("Popular Shows")
                        .font(Theme.Typography.title)
                        .foregroundColor(Theme.Colors.primaryText)
                        .padding(.horizontal, Theme.Spacing.screenPadding)

                    ForEach(viewModel.shows) { show in
                        ShowCard(
                            title: show.title,
                            description: show.description,
                            imageColor: Color(hex: show.imageColor),
                            episodeInfo: "\(show.episodeCount) episodes",
                            size: .small
                        )
                        .padding(.horizontal, Theme.Spacing.screenPadding)
                    }
                }
            }
            .padding(.bottom, Theme.Sizing.miniPlayerHeight + Theme.Sizing.tabBarHeight)
        }
        .background(Theme.Colors.background)
        .onChange(of: viewModel.searchText) { oldValue, newValue in
            if !newValue.isEmpty {
                viewModel.searchShows(query: newValue)
            }
        }
    }
}

#Preview {
    DiscoverView()
}
