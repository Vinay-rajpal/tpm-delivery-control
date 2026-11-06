# INTERNAL brief: Kavach  (do not send)
Report date: Fri 06 Nov 2026  |  Status: Red

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
- R05 (score 9 (High x High)): Kavach go-live next Monday has little time for UAT defect fixes and retesting. Release depends on separate EMI accuracy, call stability, network approval, UAT acceptance and operational readiness gates.

## Next actions, by due date

| Due | ID | Owner | Action | Flag |
|---|---|---|---|---|
| Mon 09 Nov 2026 | R01 | Dev | Send addresses Mon 10:00; request expedited written approval, follow up daily, ask provider about temporary old-IP support, and test connectivity. If approval is too late for meaningful Thu UAT, propose UAT Mon 16 Nov and re-baseline go-live (proposed Mon 23 Nov), subject to client agreement. | due this week |
| Tue 10 Nov 2026 | R02 | Meera | Meera and Sana investigate call IDs, loan source and transcripts; Arjun supports a 2-hour data check. Fix and validate by Tue; hand over evidence. Hold UAT if specialist issue cannot be safely supported during leave. | due this week |
| Tue 10 Nov 2026 | R03 | Meera | Reproduce long calls with provider logs and Dev; fix and retest 20 calls longer than 40 seconds. Document root cause and handover by Tue; no UAT with unresolved critical disconnections. | due this week |
| Tue 10 Nov 2026 | R04 | TPM | Handover to Arjun and Sana by Tuesday end of day. Confirm who covers each open item. No change to her leave. | due this week |
| Tue 10 Nov 2026 | R07 | TPM | Reserve and confirm Arjun allocation Mon–Tue for Ledger dry-run without delaying critical Kavach work. Confirm Sana/Dev coverage and Rohan count-check capability. Escalate any resource collision; do not pull Arjun from Thu–Fri go-live prep. | due this week |
| Wed 11 Nov 2026 | R08 | Dev | Limit test calls to the planned re-runs. Analyse model use, call length and retries. Report the cause to the Group CTO by Wed. | due this week |
| Fri 13 Nov 2026 | R05 | TPM | Tue 17:00 readiness forecast; complete Wed regression and network validation before UAT. Check each release gate separately; Fri 16:00 formal go/no-go with Nirmal CTO. No production release with a failed blocking gate. | due this week |

Items kept out of the client report: R04, R07, R08

## Changes since the last run

No change since the last report.
