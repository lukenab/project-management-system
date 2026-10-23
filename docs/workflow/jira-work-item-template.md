# Jira Work Item Template

Copy the template below into the Jira description.
Fill in relevant sections and remove those that do not apply.

- Adapt this template for a Task, Story, or Bug.
- Feature work should cover the end-to-end flow; foundation tasks only need the relevant layers. Remove Model or Backend items for frontend-only work.
- Explain any `N/A`, for example: `N/A — shared frontend foundation`.
- When copying references into Jira, use GitHub file URLs and mockup URLs instead of repository-relative paths.

## Objective
Describe the expected result and scope.

## References
- Use Case:
- Mockup:
- Data dictionary / API contract:

## Acceptance Criteria
- [ ] Expected successful behavior.
- [ ] Invalid input and error handling.
- [ ] Data is saved and displayed correctly.

## Implementation Checklist
- [ ] Model / validation
- [ ] Backend / API
- [ ] Frontend / integration
- [ ] Verification

## Dependencies and Constraints
List prerequisites, business rules, and exclusions.

## How to Verify
Describe the steps and expected results.

## Example — Implement Create Project

### Objective
Allow Staff to create a project and become its Project Owner.
Deliver the complete flow from the creation form to MongoDB.

### References
- Use Case: UC-06.1 — Create Project
- Mockup: [Link to Create Project screen]
- Data dictionary: [MongoDB Data Dictionary](../database/data-dictionary.md)

### Acceptance Criteria
- [ ] Valid input creates a Project and its Owner membership.
- [ ] The project key is unique.
- [ ] The creator's membership has accessRole OWNER and status ACTIVE.
- [ ] Missing required input displays validation messages without saving.
- [ ] Creation failure does not leave a Project without its Owner membership.
- [ ] Successful creation opens the new project's overview.
- [ ] Refreshing the page preserves the saved project information.

### Implementation Checklist
- [ ] Implement Project and ProjectMembership models and validation.
- [ ] Implement POST /api/projects.
- [ ] Implement the creation form and API integration.
- [ ] Handle loading, validation, and API error states.
- [ ] Verify the flow and run applicable lint/format checks.

### Dependencies and Constraints
- A seeded development account is available.
- Obtain the creator from the centralized development actor adapter;
  do not accept owner identity from the request body.
- Development actor simulation must not run in production.
- Project ownership does not automatically grant Product Owner accountability.
- Authentication UI and Google Sign-In are outside this task.

### How to Verify
1. Open the Create Project form using the development account.
2. Submit valid project information.
3. Verify the Project and active Owner membership in MongoDB.
4. Verify navigation to the project overview.
5. Refresh and confirm the information remains available.
6. Submit missing required input and a duplicate project key.
7. Confirm clear errors and no unintended records.
8. Simulate membership-creation failure and confirm that
   no partially created Project remains.
