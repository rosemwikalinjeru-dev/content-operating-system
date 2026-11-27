/**
 * The owner's voice samples (tests/fixtures/voice), offered as one-click knowledge import.
 * Generated from the fixture files; a test checks they stay identical.
 * The interview story is verified (the owner's own published post); its freelance call to action is
 * off-positioning and is flagged so it is never used as a pattern.
 */
export interface VoiceSample {
  file: string;
  kind: "example_post" | "story";
  title: string;
  body: string;
  note?: string;
}

export const VOICE_SAMPLES: VoiceSample[] = [
  {
    "file": "post-001-hidden-losses.md",
    "kind": "example_post",
    "title": "The losses that never show up in marketing reports",
    "body": "You could be paying to attract customers while quietly losing the ones you already have.\n\nMost of these losses never show up in your marketing reports.\n\n1. The call nobody picked up\n“I’ll call them back.” Nobody did.\n\n2. The price you sent on Tuesday\nThey went quiet. You assumed they weren’t interested.\n\n3. The message on your website\nThey messaged Friday night. You replied Monday.\n\n4. The happy customer\nNobody asked for a review while the experience was still fresh.\n\n5. The regular you haven’t seen since spring\nNobody followed up or gave them a reason to return.\n\nEach one feels small.\n\nTogether, they’re a second business you’re giving away.\n\nBefore spending more to attract new customers, look at where you’re losing the ones who already showed interest.\n\nToday, pick one number and ask your team for a rough count."
  },
  {
    "file": "post-002-review-asking.md",
    "kind": "example_post",
    "title": "Reviews are an asking problem",
    "body": "Your Google reviews are written on your worst day, not your average one.\n\nHere’s why, and it’s not your service.\n\nAn unhappy customer goes home angry.\nAnger is a great motivator.\nThey write the review that night.\n\nA happy customer goes home happy.\nHappy people make dinner.\nThey watch something.\nThey forget.\nThey meant to leave you five stars.\n\nNobody reminded them.\n\nSo your page fills up with the few who were upset, while the many who loved you stay silent.\n\nThat’s not a reputation problem.\n\nIt’s an asking problem.\n\nThe fix is boring:\nAsk every happy customer, within a few hours, while the feeling is fresh.\n\nMake it one tap. The link, not “find us on Google.”\n\nDo it every time, not when someone remembers.\n\nGood work doesn’t speak for itself. Someone has to ask it to.\n\nToday, ask your team one question: “Who sends the review request, and when?”\nIf the answer is “whoever remembers,” it’s nobody."
  },
  {
    "file": "post-003-interview-story.md",
    "kind": "story",
    "title": "Waiting nine hours for a security guard interview",
    "body": "I once waited nearly 9 hours for a job interview, only to be asked why someone with my qualifications wanted to work as a security guard.\n\nMy answer was simple: “I just want something to help me survive as I build myself.”\n\nThis was around 16th August 2024, during one of the toughest periods of my life.\n\nI arrived at the interview venue at around 8 a.m.\n\nMore than 200 people were already there.\n\nBy the time I finally sat in front of the interviewer, it was around 5 p.m.\n\nI had my qualifications, my papers, and my dreams.\n\nBut at that moment, I needed an opportunity to earn money, get back on my feet, and change my circumstances.\n\nI was ready to take that security job while building my business and working towards the life I wanted.\n\nMy priority was to survive, become financially stable, and move out of the village.\n\nI believed there was more out there for me, and I was willing to start wherever I could.\n\nLooking back today, I'm grateful for how far I've come.\n\nThe journey hasn't been easy, but the growth and lessons have been worth it.\n\nLooking ahead, I'm open to AI automation opportunities, freelance projects, and collaborations where I can use my skills to solve real business problems, improve processes, and help businesses grow.",
    "note": "Narrative voice only. Do not reuse the closing call to action (off-positioning)."
  },
  {
    "file": "post-004-boring-first.md",
    "kind": "example_post",
    "title": "Start with the boring thing that happens all day",
    "body": "Don’t start with the hardest part of your business.\n\nStart with the boring thing that happens all day.\n\nThink about clearing out your house.\n\nYou don’t start with the garage.\n\nThe garage takes a month.\n\nYou start with the kitchen drawer you open every single day.\n\nTen minutes, and you feel it straight away.\n\nYour business works the same way.\n\nThe big, messy thing is tempting.\n\n“Let’s fix the whole booking system.”\n“Let’s put AI on everything.”\n“Let’s redo how we handle complaints.”\n\nIt takes months.\n\nYou can’t tell if it worked.\n\nAnd by then, nobody remembers how it was before.\n\nNow look at the boring things instead.\n\nThe booking confirmation you send by hand.\nThe “what time do you open?” message you answer ten times a day.\nThe reminder text someone forgets on busy days.\n\nNobody gets excited about these.\n\nBut they happen all day.\n\nSo when you fix one, you see the difference within a week.\nFewer missed texts.\nFewer no-shows.\nFewer interruptions.\n\nAnd that’s when you know it’s worth doing the next one.\n\nBoring and frequent beats big and complicated.\n\nEvery time."
  }
];
