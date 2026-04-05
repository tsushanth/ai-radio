import XCTest

@MainActor
class ScreenshotTests: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = false
        setupSnapshot(app)
        app.launch()
    }

    func testScreenshots() {
        sleep(3)
        snapshot("01_Home")

        // Navigate to Profile tab (custom floating tab)
        // Try tapping the profile icon in the custom tab bar
        if app.buttons["Profile"].exists {
            app.buttons["Profile"].tap()
        } else if app.buttons["person.fill"].exists {
            app.buttons["person.fill"].tap()
        }
        sleep(1)
        snapshot("02_Profile")

        // Back to home
        if app.buttons["Home"].exists {
            app.buttons["Home"].tap()
        } else if app.buttons["house.fill"].exists {
            app.buttons["house.fill"].tap()
        }
        sleep(1)
        snapshot("03_HomeMain")
    }
}
