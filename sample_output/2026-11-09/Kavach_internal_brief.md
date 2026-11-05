# INTERNAL brief: Kavach  (do not send)
Report date: Mon 09 Nov 2026  |  Status: Red

**Go/no-go readiness: NO-GO**

- Blocking: K1 New telephone-provider addresses approved in writing by the client network team [Pending]
- Blocking: K2 0 wrong EMI amounts in the final 50 calls and cause explained [Pending]
- Blocking: K3 0 stopped calls in 20 calls past 40 seconds and cause explained [Pending]
- Blocking: K4 UAT signed in writing by the client CTO with no open critical or high defect [Pending]
- Blocking: K5 Monitoring and alerts working and rollback switch tested [Pending]
- Blocking: K6 Test-call cost 40% over budget: cause explained and accepted in writing by the Group CTO or brought inside budget [Pending]
- Blocking: K7 Cover for go-live week confirmed (Arjun Dev Sana) [Pending]

Gates:
- [Pending] K1 New telephone-provider addresses approved in writing by the client network team (owner Dev, due Thu 12 Nov 2026)
- [Pending] K2 0 wrong EMI amounts in the final 50 calls and cause explained (owner Meera, due Fri 13 Nov 2026)
- [Pending] K3 0 stopped calls in 20 calls past 40 seconds and cause explained (owner Meera, due Fri 13 Nov 2026)
- [Pending] K4 UAT signed in writing by the client CTO with no open critical or high defect (owner TPM, due Fri 13 Nov 2026)
- [Pending] K5 Monitoring and alerts working and rollback switch tested (owner Dev, due Fri 13 Nov 2026)
- [Pending] K6 Test-call cost 40% over budget: cause explained and accepted in writing by the Group CTO or brought inside budget (owner Dev, due Wed 11 Nov 2026)
- [Pending] K7 Cover for go-live week confirmed (Arjun Dev Sana) (owner TPM, due Thu 12 Nov 2026)

## Escalate to the Group CTO (5)

- R01 (score 9 (Occurred x High)): The telephone provider changed its IP addresses. The client's network team must approve the new ones (3 working days) before calls work, so UAT on Thu 12 Nov may not start.
- R02 (score 9 (Occurred x High)): In 4 of 50 test calls the agent stated a wrong EMI amount. The cause is unknown.
- R03 (score 9 (Occurred x High)): 2 test calls stopped after about 40 seconds. The cause is unknown.
- R04 (score 9 (High x High)): Meera (the only AI/ML engineer) is on leave Wed–Fri, so problems found in UAT may wait for a fix.
- R05 (score 9 (High x High)): Go-live next Monday leaves almost no time to fix and retest after UAT (Thu–Fri). The client's Managing Director attends the go-live call.

## Next actions, by due date

| Due | ID | Owner | Action | Flag |
|---|---|---|---|---|
| Mon 09 Nov 2026 | R01 | Dev | Send the new addresses to Nirmal's network team Mon 10:00 and ask for urgent approval. Get the approval in writing and track it daily. Ask the provider whether the old addresses can stay active. Confirm our own test calls still work. If approval comes after Thu 12:00, UAT is cut short and I propose Mon 23 Nov for go-live. | DUE TODAY |
| Tue 10 Nov 2026 | R02 | Meera | Find the cause from call IDs, logs and transcripts (Sana shares the call IDs; Arjun does a 2-hour data check Mon). Document the fix or workaround and hand it over to Arjun and Sana. | due this week |
| Tue 10 Nov 2026 | R03 | Meera | Reproduce with the provider's call logs (Dev supports). Find the cause and fix it. Re-run the 50 test calls. | due this week |
| Tue 10 Nov 2026 | R04 | TPM | Handover to Arjun and Sana by Tuesday end of day. Confirm who covers each open item. No change to her leave. | due this week |
| Tue 10 Nov 2026 | R07 | TPM | Do the Ledger fix Mon PM–Tue so Arjun is free from Thursday. Ask Rohan to cover the Ledger count checks. If the fix is not done by Tue end of day, agree a new date with the COO rather than pull Arjun off Kavach. | due this week |
| Wed 11 Nov 2026 | R08 | Dev | Limit test calls to the planned re-runs. Analyse model use, call length and retries. Report the cause to the Group CTO. | due this week |
| Fri 13 Nov 2026 | R05 | TPM | Go/no-go for UAT Tue 17:00. Go-live gate Fri 16:00. If the gates are not met, propose moving go-live one week to Mon 23 Nov. | due this week |

Items kept out of the client report: R04, R07, R08

## Changes since the last run

First run: this is the baseline, so there is nothing to compare yet.
