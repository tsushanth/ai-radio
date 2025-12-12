//
//  Show.swift
//  BriefCast
//
//  Podcast show and category models
//

import Foundation

struct Show: Identifiable, Codable {
    let id: String
    let title: String
    let description: String
    let category: String
    let imageUrl: String?
    let imageColor: String // hex color for placeholder gradient
    let episodeCount: Int
    let isSubscribed: Bool
    let publisher: String?
    let rating: Double?

    enum CodingKeys: String, CodingKey {
        case id, title, description, category
        case imageUrl = "image_url"
        case imageColor = "image_color"
        case episodeCount = "episode_count"
        case isSubscribed = "is_subscribed"
        case publisher, rating
    }
}

// MARK: - Category Model

struct Category: Identifiable {
    let id: String
    let name: String
    let icon: String // SF Symbol name
    let color: String // hex color
    var shows: [Show]

    var trendIcon: String {
        "chart.line.uptrend.xyaxis"
    }
}

// MARK: - Mock Data for Preview

extension Show {
    static let mock = Show(
        id: "1",
        title: "Tech News Daily",
        description: "Latest technology updates and trends",
        category: "Technology",
        imageUrl: nil,
        imageColor: "#4A90E2",
        episodeCount: 42,
        isSubscribed: true,
        publisher: "TechCast Network",
        rating: 4.7
    )

    static let mockList: [Show] = [
        Show.mock,
        Show(
            id: "2",
            title: "Business Brief",
            description: "Market updates and business insights",
            category: "Business",
            imageUrl: nil,
            imageColor: "#50C878",
            episodeCount: 28,
            isSubscribed: false,
            publisher: "Finance Today",
            rating: 4.5
        ),
        Show(
            id: "3",
            title: "Health & Wellness",
            description: "Daily tips for a healthier lifestyle",
            category: "Health",
            imageUrl: nil,
            imageColor: "#FF6B9D",
            episodeCount: 65,
            isSubscribed: true,
            publisher: "Wellness Co",
            rating: 4.8
        ),
        Show(
            id: "4",
            title: "AI Weekly",
            description: "Deep dives into artificial intelligence",
            category: "Technology",
            imageUrl: nil,
            imageColor: "#9B59B6",
            episodeCount: 24,
            isSubscribed: false,
            publisher: "AI Insider",
            rating: 4.9
        ),
        Show(
            id: "5",
            title: "Startup Stories",
            description: "Insights from successful founders",
            category: "Business",
            imageUrl: nil,
            imageColor: "#E67E22",
            episodeCount: 56,
            isSubscribed: true,
            publisher: "Founder's Hub",
            rating: 4.6
        ),
        Show(
            id: "6",
            title: "Science Simplified",
            description: "Complex science made accessible",
            category: "Science",
            imageUrl: nil,
            imageColor: "#3498DB",
            episodeCount: 89,
            isSubscribed: false,
            publisher: "SciComm Media",
            rating: 4.7
        )
    ]

    // Factory method for creating mock shows
    static func mockShow(
        id: String = UUID().uuidString,
        title: String,
        description: String,
        category: String,
        imageColor: String,
        episodeCount: Int = 20,
        isSubscribed: Bool = false,
        publisher: String = "BriefCast",
        rating: Double = 4.5
    ) -> Show {
        Show(
            id: id,
            title: title,
            description: description,
            category: category,
            imageUrl: nil,
            imageColor: imageColor,
            episodeCount: episodeCount,
            isSubscribed: isSubscribed,
            publisher: publisher,
            rating: rating
        )
    }
}

extension Category {
    static let mockNews = Category(
        id: "news",
        name: "News",
        icon: "newspaper.fill",
        color: "#E74C3C",
        shows: [
            Show.mockShow(
                title: "Daily Headlines",
                description: "Top stories from around the world",
                category: "News",
                imageColor: "#E74C3C",
                episodeCount: 365
            ),
            Show.mockShow(
                title: "Global Perspective",
                description: "International news analysis",
                category: "News",
                imageColor: "#C0392B",
                episodeCount: 180
            ),
            Show.mockShow(
                title: "Morning Digest",
                description: "Quick news updates to start your day",
                category: "News",
                imageColor: "#EC7063",
                episodeCount: 250
            )
        ]
    )

    static let mockTech = Category(
        id: "tech",
        name: "Technology",
        icon: "cpu.fill",
        color: "#4A90E2",
        shows: [
            Show.mockShow(
                title: "Tech Trends",
                description: "Latest in consumer technology",
                category: "Technology",
                imageColor: "#4A90E2",
                episodeCount: 120
            ),
            Show.mockShow(
                title: "Code & Coffee",
                description: "Programming insights and tutorials",
                category: "Technology",
                imageColor: "#3498DB",
                episodeCount: 85
            ),
            Show.mockShow(
                title: "DevOps Daily",
                description: "Infrastructure and deployment tips",
                category: "Technology",
                imageColor: "#5DADE2",
                episodeCount: 60
            )
        ]
    )

    static let mockAI = Category(
        id: "ai",
        name: "AI & ML",
        icon: "brain.head.profile",
        color: "#9B59B6",
        shows: [
            Show.mockShow(
                title: "AI Explained",
                description: "Understanding artificial intelligence",
                category: "AI",
                imageColor: "#9B59B6",
                episodeCount: 45
            ),
            Show.mockShow(
                title: "Machine Learning Weekly",
                description: "Latest ML research and applications",
                category: "AI",
                imageColor: "#8E44AD",
                episodeCount: 52
            ),
            Show.mockShow(
                title: "Neural Networks",
                description: "Deep learning breakthroughs",
                category: "AI",
                imageColor: "#A569BD",
                episodeCount: 38
            )
        ]
    )

    static let mockBusiness = Category(
        id: "business",
        name: "Business",
        icon: "chart.line.uptrend.xyaxis",
        color: "#50C878",
        shows: [
            Show.mockShow(
                title: "Market Watch",
                description: "Stock market and trading insights",
                category: "Business",
                imageColor: "#50C878",
                episodeCount: 200
            ),
            Show.mockShow(
                title: "Entrepreneur's Edge",
                description: "Building successful businesses",
                category: "Business",
                imageColor: "#27AE60",
                episodeCount: 95
            ),
            Show.mockShow(
                title: "Finance Friday",
                description: "Personal finance and investing",
                category: "Business",
                imageColor: "#58D68D",
                episodeCount: 110
            )
        ]
    )

    static let mockList: [Category] = [
        mockNews,
        mockTech,
        mockAI,
        mockBusiness
    ]
}
