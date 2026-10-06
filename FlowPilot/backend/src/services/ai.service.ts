interface TestScenario {
  testId: string;
  scenario: string;
  type: string;
  expectedResult: string;
}

interface GenerateTestScenariosInput {
  requirement: string;
}

export class AIService {
  static async generateTestScenarios({ requirement }: GenerateTestScenariosInput) {
    const normalizedRequirement = requirement.trim();
    const scenarios: TestScenario[] = [
      {
        testId: 'TC-001',
        scenario: `Verify the happy path for: ${normalizedRequirement}`,
        type: 'Positive',
        expectedResult: 'The requirement is completed successfully with valid input.',
      },
      {
        testId: 'TC-002',
        scenario: `Verify invalid input handling for: ${normalizedRequirement}`,
        type: 'Negative',
        expectedResult: 'Invalid input is rejected with a clear validation message.',
      },
      {
        testId: 'TC-003',
        scenario: `Verify boundary conditions for: ${normalizedRequirement}`,
        type: 'Boundary',
        expectedResult: 'Boundary values are handled without data loss or unexpected errors.',
      },
    ];

    return { scenarios };
  }
}