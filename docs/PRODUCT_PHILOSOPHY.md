# AlphaTekx Product Philosophy

## Core identity

AlphaTekx is an **AI Employee**. It is not an automation dashboard or a
workflow builder.

Alpha plans work with the user, executes approved work, continues while the
user is offline, and reports back honestly when work completes or needs
attention.

The product mission is:

> Turn Your Ideas Into Reality.
>
> Plan once. Approve once. Sleep peacefully. Alpha works for you.

## Permanent product principles

Every product and engineering decision must follow these principles:

1. Simplicity above everything.
2. Give each screen one clear purpose.
3. Hide implementation complexity.
4. Ask only questions required to perform the job safely.
5. Continue approved work after the user leaves.
6. Never overwhelm the user.
7. Ship capabilities that save real time.
8. Make every automation feel like hiring an employee.

Before shipping, ask:

> Does this make AlphaTekx feel more like an intelligent employee that works
> while the user sleeps?

If the answer is no, redesign the experience.

## Automation model

Creating an automation means Alpha is accepting a job, not merely creating a
task. A job should retain its plan, approvals, operating context, execution
state, results, and actionable failures.

- **Automation Workspace** is where the user and Alpha plan a job.
- **Active Automations** is where the user manages running AI employees.
- Alpha must keep working after the user leaves when approval and resources
  permit.
- Alpha must report confirmed outcomes rather than optimistic or inferred
  success.

## Long-running content work

Social media jobs must develop a long-term strategy instead of repeatedly
generating variations of the same post. Content memory should retain:

- previous posts
- hooks
- topics
- calls to action
- hashtags
- image concepts
- approval and edit history

New content should use this memory to remain fresh, consistent with the brand,
and useful to the audience.

## Images

Social publishing should eventually support provider-independent image
generation. Alpha should derive image direction from the mission, audience,
platform, tone, brand, and previous content. Users should not need to write
image prompts.

Image generation is roadmap work, not authorization to implement it in an
unrelated task.

## Credits

Credits represent completed work. Opening AlphaTekx or planning a job should
not itself consume credits.

Before creation, Alpha should clearly estimate:

- duration
- expected work units, such as posts and images
- estimated credits
- current credits
- additional credits required

The user should be able to top up, reduce duration, or reduce frequency before
accepting the job.

Credits are normally deducted only after confirmed successful work. Do not
charge for OAuth failures, provider failures, prevented duplicates, failed
publishing, failed image generation, or scheduler failures.

Insufficient credits should put a job into **Waiting for Credits**, notify the
user, and allow automatic resumption after credits are added. It should not
silently fail the job.

## Roadmap guardrails

The current priority is to perfect the automation platform:

1. reliability and mobile polish
2. Facebook
3. X
4. provider-independent image generation
5. long-term campaign intelligence

Do not begin the following phases until the current automation experience is
production-ready:

- AI YouTube Studio
- Company Builder
- Universal AI Research and Video Creator

Roadmap descriptions express direction, not permission to introduce a feature
outside an approved implementation task.

## Definition of a good experience

The user explains the outcome once. Alpha asks only what is missing, shows a
clear plan and credit estimate, obtains the required approval, performs the
work reliably, remembers relevant context, and reports a truthful result.

The interface should expose decisions and outcomes while keeping orchestration,
providers, retries, idempotency, scheduling, and persistence out of the user's
way.
