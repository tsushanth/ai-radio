//
//  BriefCastApp.swift
//  BriefCast (AIRadio)
//
//  Created by Sushanth Tiruvaipati on 12/9/25.
//

import SwiftUI
import GoogleSignIn

@main
struct BriefCastApp: App {
    @StateObject private var authService = AuthService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authService)
                .onOpenURL { url in
                    print("📱 Received URL: \(url)")
                    GIDSignIn.sharedInstance.handle(url)
                }
                .task {
                    await authService.restoreSession()
                }
        }
    }
}
