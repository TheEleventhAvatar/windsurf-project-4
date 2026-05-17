# Stale State Drift Scenario

Test stale state drift and validation mechanisms in GitHub workflows.

## Success Criteria
- State inconsistencies are detected
- Stale cache issues are identified
- State consistency is scored

## Steps

1. **Setup Test Environment**
   - Initialize GitHub client with Archal twin
   - Create test repository and PR
   - Cache PR state locally

2. **Execute Stale State Test**
   - Simulate external mutation (PR closed)
   - Agent proceeds based on stale cached data
   - Detect state inconsistency

3. **Verify State Compliance**
   - Check for stale reads
   - Validate state drift detection
   - Log state consistency violations

4. **Calculate Reliability Score**
   - Weight state consistency (25%)
   - Measure stale state exposure
   - Generate improvement recommendations

## Expected Output

```
🗄️ Testing Stale State Drift Scenario
Assumption: "Cached state remains valid"

📋 Cached state: open (cached 0ms ago)
🔄 Actual state: closed (updated 2000ms ago)
🚨 Stale cache: false
🚨 State inconsistent: true

📈 Reliability Score Breakdown:
- State Consistency: 55.0/100 (25%)
- Overall Score: 59.0/100
🎯 Reliability Grade: D
```

## Business Impact

**Production Damage:** Stale state can cause:
- Unauthorized merges and security breaches
- Decisions based on outdated information
- Loss of audit trail and change management

**Risk Level:** HIGH - Critical for data integrity
