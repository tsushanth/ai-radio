//
//  DiscoverViewModel.swift
//  BriefCast
//
//  Discover view model
//

import Foundation

@MainActor
class DiscoverViewModel: ObservableObject {
    @Published var shows: [Show] = []
    @Published var categories: [Category] = []
    @Published var searchText: String = ""
    @Published var isLoading: Bool = false

    init() {
        loadMockData()
    }

    // MARK: - Data Loading

    func loadShows() {
        // TODO: Implement show discovery from API
        print("Load shows - TODO")
    }

    func searchShows(query: String) {
        // TODO: Implement search functionality
        print("Search shows: \(query) - TODO")
    }

    // MARK: - Mock Data

    private func loadMockData() {
        shows = Show.mockList
        categories = Category.mockList
    }
}
