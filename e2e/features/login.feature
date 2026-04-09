Feature: Secure fintech authentication

  # The MFA scenario below is intentionally commented out until mailbox/OTP
  # integration is wired for E2E (e.g. MFA_TEST_OTP or stable OTP retrieval).
  # Re-enable it when the pipeline is ready; MFA contract tests stay in Playwright API specs.

  @e2e @auth @smoke
  Scenario: Verified customer signs in and accesses dashboard
    Given I open the BizFlex login page
    When I sign in with a valid customer account
    Then I should be redirected to the secure dashboard
    And I should see my wallet balance and quick actions
    And I should see the recent transactions table

  # @e2e @auth @mfa
  # Scenario: MFA-enabled customer completes secure login
  #   Given I open the BizFlex login page
  #   When I sign in with an MFA-enabled account
  #   Then I should see that a 2FA code was sent
  #   When I enter the valid OTP code
  #   Then I should be redirected to the secure dashboard

