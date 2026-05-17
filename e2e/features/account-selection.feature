# Business-readable scenarios for post-login workspace selection (/select-account).
# Automation reuses the same helpers as tests/auth/account-selection.ui.spec.ts.
# Account names and IDs come from environment configuration — not written here.

Feature: Choose a workspace after login

  Customers with more than one linked account must pick which workspace to use
  before reaching the dashboard.

  @e2e @accounts
  Scenario: Customer sees the account picker after signing in
    Given I open the BizFlex login page
    When I sign in and reach the account picker
    Then I should see the account picker
    And I should see the Continue action
    And I should see the option to add a new account

  @e2e @accounts @requires-freelance-config
  Scenario: Customer sees their configured freelance account on the picker
    Given I open the BizFlex login page
    When I sign in and reach the account picker
    Then I should see my configured freelance account on the picker

  @e2e @accounts @requires-business-config
  Scenario: Customer sees their configured business account on the picker
    Given I open the BizFlex login page
    When I sign in and reach the account picker
    Then I should see my configured business account on the picker

  @e2e @accounts @requires-freelance-config
  Scenario: Customer continues with their freelance workspace
    Given I open the BizFlex login page
    When I sign in and reach the account picker
    And I choose my configured freelance workspace
    Then I should be on the account dashboard

  @e2e @accounts @requires-business-config
  Scenario: Customer continues with their business workspace
    Given I open the BizFlex login page
    When I sign in and reach the account picker
    And I choose my configured business workspace
    Then I should be on the account dashboard

  @e2e @accounts @requires-freelance-config @requires-business-config
  Scenario: Customer switches from freelance to business workspace
    Given I open the BizFlex login page
    When I sign in and reach the account picker
    And I choose my configured freelance workspace
    Then I should be on the account dashboard
    When I open the account picker again
    And I choose my configured business workspace
    Then I should be on the account dashboard

  @e2e @accounts @requires-second-business-config
  Scenario: Customer sees their second configured business account on the picker
    Given I open the BizFlex login page
    When I sign in and reach the account picker
    Then I should see my second configured business account on the picker

  @e2e @accounts @requires-business-config @requires-second-business-config
  Scenario: Customer switches between two business workspaces
    Given I open the BizFlex login page
    When I sign in and reach the account picker
    And I choose my configured business workspace
    Then I should be on the account dashboard
    When I open the account picker again
    And I choose my second configured business workspace
    Then I should be on the account dashboard
