import { FeedRuleProperties } from "./feed-engine";

export const defaultHomeFeedRules: FeedRuleProperties[] = [
    new FeedRuleProperties(
        "hide replies from feed",
        {
            all: [
                {
                    fact: "in_reply_to_id",
                    operator: "notEqual",
                    value: null,
                }
            ]
        },
        { type: "hidePost" }
    ),
    new FeedRuleProperties(
        "attach linked ancestor posts to all posts when available",
        {
            all: [
                {
                    fact: "id",
                    operator: "notEqual",
                    value: null,
                }
            ]
        },
        { type: "attachLinked" }
    )
]

export const defaultFeedRules: FeedRuleProperties[] = [
    new FeedRuleProperties(
        "hide replies from feed",
        {
            all: [
                {
                    fact: "in_reply_to_id",
                    operator: "notEqual",
                    value: null,
                }
            ]
        },
        { type: "hidePost" }
    ),
    new FeedRuleProperties(
        "attach linked ancestor posts to all posts when available",
        {
            all: [
                {
                    fact: "id",
                    operator: "notEqual",
                    value: null,
                }
            ]
        },
        { type: "attachLinked" }
    ),

    new FeedRuleProperties(
        "label posts written with pillbug",
        {
            all: [
                {
                    fact: "application",
                    operator: "equal",
                    path: "$.name",
                    value: "pillbug",
                }
            ]
        },
        { type: "applyLabel", params: { label: "pillbug" } }
    )
]