import { useParams } from "@solidjs/router";
import {
    createContext,
    createResource,
    createSignal,
    ErrorBoundary,
    For,
    Match,
    onCleanup,
    onMount,
    ResourceFetcher,
    Show,
    Signal,
    Switch,
    useContext,
    type Component,
} from "solid-js";
import Post from "~/components/post";
import { Status } from "megalodon/lib/src/entities/status";
import { useAuth } from "~/auth/auth-manager";
import { ProfileZone } from "~/components/user/profile-zone";
import { Comment } from "~/components/post/comments";
import { Card } from "~/components/ui/card";
import { ErrorBox } from "~/components/error";
import { MaybeSignedInState } from "~/auth/auth-types";
import {
    LayoutColumnsRoot,
    LayoutMainColumn,
} from "~/components/layout/columns";
import { useFrameContext } from "~/components/frame/context";
import { NewCommentEditor } from "~/components/editor/comments";
import { unwrapResponse } from "~/lib/clientUtil";
import { logger } from "~/logging";

/** Fetch the info for a post and arrange its context in a nested tree structure before returning. */
export async function fetchPostInfoTree(
    props: {
        loadProps: LoadPostsProps;
        signedInState: MaybeSignedInState;
    },
    previousTree: IPostTreeNode | undefined
): Promise<IPostTreeNode> {
    const loadPostsProps = props.loadProps;
    const signedInState = props.signedInState;

    logger.info(
        `fetching post info tree with props: ${JSON.stringify(loadPostsProps)}`
    );
    if (!signedInState?.signedIn) {
        return new PostTreePlaceholderNode("not signed in", []);
    }

    const client = signedInState.authenticatedClient;
    if (
        previousTree !== undefined &&
        loadPostsProps.newCommentId !== undefined
    ) {
        logger.info(
            `attempting to patch previous post tree with new comment ${loadPostsProps.newCommentId}`
        );
        const newCommentRequest = await client.getStatus(
            loadPostsProps.newCommentId
        );
        if (newCommentRequest.status !== 200) {
            throw new Error(
                `Failed to get new comment ${loadPostsProps.newCommentId}: ${newCommentRequest.statusText}`
            );
        }

        const newComment = newCommentRequest.data;
        const targetId = newComment.in_reply_to_id;
        const visited: string[] = [];
        let success = false;

        // Attempt to find where to attach it recursively.
        const tryAttachTo = (node: IPostTreeNode) => {
            const status = node.tryGetStatus();
            if (status !== undefined) {
                if (visited.indexOf(status.id) !== -1) {
                    throw new Error(
                        `visited the same status ${status.id} twice.`
                    );
                }

                visited.push(status.id);
                if (status.id === targetId) {
                    node.children.push(
                        new PostTreeStatusNode(newComment, [], true)
                    );
                    success = true;
                    return;
                }
            }

            for (const child of node.children) {
                tryAttachTo(child);
            }
        };

        if (targetId === null) {
            logger.info(
                `the new comment ${newComment.id} did not set an id it's a reply to, this is a bug.`
            );
        }

        tryAttachTo(previousTree);

        if (!success) {
            logger.info(
                `couldn't find ${targetId} to attach the new comment ${newComment.id} to. attaching it to the root...`
            );
            previousTree.children.push(
                new PostTreeStatusNode(newComment, [], true)
            );
        }

        return previousTree;
    } else {
        const postId = loadPostsProps.postId;

        logger.info(`getting post ${postId}`);

        const requestedStatus = unwrapResponse(await client.getStatus(postId));

        try {
            // If the post we're looking at is a reblog, get context for the reblog target.
            const postIdForContext =
                requestedStatus.reblog?.id ?? requestedStatus.id;
            const requestedStatusContext = unwrapResponse(
                await client.getStatusContext(postIdForContext)
            );
            if (requestedStatusContext === undefined) {
                throw new Error("status context undefined");
            }

            let unsortedStatuses: Status[] = [];
            unsortedStatuses.push(...requestedStatusContext.ancestors);
            unsortedStatuses.push(...requestedStatusContext.descendants);

            let idMap: Map<string, IPostTreeNode> = new Map();

            const rootPost = locateRootNode(
                requestedStatus,
                idMap,
                unsortedStatuses
            );

            // Try to attach all the remaining statuses to the tree somewhere
            attachStatusesToTree(rootPost, idMap, unsortedStatuses);
            return rootPost;
        } catch (e) {
            let errorNode;
            if (e instanceof Error) {
                logger.info(
                    `Failed to get context for post ${postId}: ${e.stack}`
                );
                errorNode = new PostTreePlaceholderNode(
                    `Failed to get context for post ${postId}: ${e.message}`,
                    [],
                    false
                );
            }
            if (!errorNode) {
                errorNode = new PostTreePlaceholderNode(
                    `Failed to get context for post ${postId}: unknown error`,
                    [],
                    false
                );
            }
            const root = new PostTreeStatusNode(
                requestedStatus,
                [errorNode],
                true
            );
            return root;
        }
    }
}

/** Locate the root status and construct a node from it. */
function locateRootNode(
    /** The status the page is for. Not necessarily the root, if it's a comment. */
    requestedStatus: Status,
    /** A map of post ids to nodes. May be modified as a side effect of this function. */
    idMap: Map<string, IPostTreeNode>,
    /** A list of statuses that have not been added to the tree yet. May be modified as a side effect. */
    unsortedStatuses: Status[]
): IPostTreeNode {
    let rootPost: IPostTreeNode = new PostTreeStatusNode(
        requestedStatus,
        [],
        true
    );
    const status = rootPost.tryGetStatus();
    if (status !== undefined) {
        idMap.set(requestedStatus.id, rootPost);

        // Go upwards until finding the root, in case the requested status is a reply.
        while (status.in_reply_to_id !== null) {
            const parentStatusIndex = unsortedStatuses.findIndex(
                (s) =>
                    s.id ===
                    (rootPost as PostTreeStatusNode).status.in_reply_to_id
            );
            if (parentStatusIndex === -1) {
                // The parent of this isn't available, so it's just going to be the parent.
                break;
            }

            const newRootStatus: Status = unsortedStatuses.splice(
                parentStatusIndex,
                1
            )[0];
            rootPost = new PostTreeStatusNode(newRootStatus, [rootPost]);
            idMap.set(status.id, rootPost);
        }
    }
    return rootPost;
}

function attachStatusesToTree(
    /** The root node to attach all the others to, somehow. */
    rootNode: IPostTreeNode,
    /** A map of post ids to nodes. May be modified as a side effect of this function. */
    idMap: Map<string, IPostTreeNode>,
    /** A list of statuses that have not been added to the tree yet. May be modified as a side effect. */
    unsortedStatuses: Status[]
) {
    while (unsortedStatuses.length > 0) {
        let numAdded = 0;

        for (let i = 0; i < unsortedStatuses.length; i++) {
            const status = unsortedStatuses[i];
            if (status.in_reply_to_id === null) {
                // This is not attached to anything. Just stick it underneath the root.
                const s = new PostTreeStatusNode(status, []);
                idMap.set(status.id, s);
                rootNode.children.push(s);
                numAdded += 1;
                unsortedStatuses.splice(i, 1);
                continue;
            }
            const existingParent = idMap.get(status.in_reply_to_id);
            if (existingParent !== undefined) {
                // The parent of this status has a nestedstatus node, so we can attach this status to it now.
                const s = new PostTreeStatusNode(status, []);
                idMap.set(status.id, s);
                existingParent.children.push(s);
                numAdded += 1;
                unsortedStatuses.splice(i, 1);
                continue;
            }
        }

        if (unsortedStatuses.length === 0) {
            break;
        }

        if (numAdded === 0) {
            let status = unsortedStatuses.pop()!;
            let statusNode = new PostTreeStatusNode(status, [], false);
            let missingPostMarker = new PostTreePlaceholderNode(
                `Missing post id ${status?.in_reply_to_id}`,
                [statusNode],
                false
            );
            idMap.set(status.id, missingPostMarker);
            rootNode.children.push(statusNode);
        }
    }
}

/** A node within a tree of activitypub statuses and placeholders. Each node has zero to many child nodes. */
export interface IPostTreeNode {
    /** All child statuses. */
    children: IPostTreeNode[];
    /** Whether this status should be displayed with a highlight. When following a link to a post, this will indicate which post the link was for. */
    highlighted: boolean;
    /** Try to get the activitypub status in this node, if there is one. */
    tryGetStatus(): Status | undefined;
}

/** An activitypub status whose replies have been arranged in a nested structure. Each status has zero to many child nodes. */
export class PostTreeStatusNode implements IPostTreeNode {
    /** The source status. */
    status: Status;
    /** All child statuses. */
    children: IPostTreeNode[];
    /** Whether this status should be displayed with a highlight. When following a link to a post, this will indicate which post the link was for. */
    highlighted: boolean;
    constructor(
        status: Status,
        children: IPostTreeNode[],
        highlighted: boolean = false
    ) {
        /**  */
        this.status = status;
        /**  */
        this.children = children;
        /**  */
        this.highlighted = highlighted;
    }
    tryGetStatus(): Status | undefined {
        return this.status;
    }
}

/** A placeholder within an arranged structure of activitypub statuses & replies. If we cannot locate a parent status, a placeholder can be inserted instead. */
export class PostTreePlaceholderNode implements IPostTreeNode {
    /** The text to show in the placeholder. */
    message: string;
    /** All child statuses. */
    children: PostTreeStatusNode[];
    /** Whether this status should be displayed with a highlight. Probably irrelevant for placeholders. */
    highlighted: boolean;
    constructor(
        message: string,
        children: PostTreeStatusNode[],
        highlighted: boolean = false
    ) {
        this.message = message;
        this.children = children;
        this.highlighted = highlighted;
    }
    tryGetStatus(): Status | undefined {
        return undefined;
    }
}

export type CommentProps = {
    status: Status;
};

export interface LoadPostsProps {
    postId: string;
    lastRefresh: number;
    newCommentId?: string | undefined;
    shareEditorMode: boolean;
}

export interface PostPageContextValue {
    loadProps: Signal<LoadPostsProps>;
}
export const PostPageContext = createContext<PostPageContextValue>();

/** A page showing a root post and nested tree of comments */
const PostPage: Component = () => {
    const params = useParams();
    return (
        <PostPageForId
            postId={params.postId}
            shareEditorMode={false}
        ></PostPageForId>
    );
};

export const PostPageForId: Component<{
    postId: string;
    shareEditorMode: boolean;
}> = ({ postId, shareEditorMode }) => {
    const postContext: PostPageContextValue = {
        loadProps: createSignal<LoadPostsProps>({
            lastRefresh: Date.now(),
            postId: postId,
            shareEditorMode: shareEditorMode,
        }),
    };
    return (
        <PostPageContext.Provider value={postContext}>
            <ErrorBoundary
                fallback={(e) => (
                    <ErrorBox
                        error={e}
                        description="Failed to load post page"
                    />
                )}
            >
                <PostWithCommentTree />
            </ErrorBoundary>
        </PostPageContext.Provider>
    );
};

export function usePostPageContext(): PostPageContextValue {
    const value = useContext(PostPageContext);
    if (value === undefined) {
        throw new Error(
            "usePostPageContext must be used within a provider (a new version of pillbug may have been deployed; try refreshing)"
        );
    }
    return value;
}

const PostWithCommentTree: Component = () => {
    const auth = useAuth();
    const postPageContext = usePostPageContext();
    const threadInfoFetcher: ResourceFetcher<
        {
            loadProps: LoadPostsProps;
            signedInState: MaybeSignedInState;
        },
        IPostTreeNode,
        true
    > = (loadProps, { value, refetching }) =>
        fetchPostInfoTree(loadProps, value);
    const [loadProps, setLoadProps] = postPageContext.loadProps;
    const [threadInfo, mutateThreadInfo] = createResource(() => {
        return {
            loadProps: loadProps(),
            signedInState: auth.state,
        };
    }, threadInfoFetcher);

    // i don't like the nested show here for share mode.
    return (
        <>
            <Show when={!loadProps().shareEditorMode}>
                <Show
                    when={threadInfo()?.tryGetStatus() !== undefined}
                    fallback={<div>Loading</div>}
                >
                    <ProfileZone
                        userInfo={threadInfo()!.tryGetStatus()!.account}
                    />
                </Show>
            </Show>
            <ErrorBoundary fallback={(err) => err}>
                <Switch>
                    <Match when={threadInfo.loading}>
                        <div>loading post</div>
                    </Match>
                    <Match when={threadInfo.state === "ready"}>
                        <Post
                            class="md:px-0"
                            status={
                                threadInfo()?.tryGetStatus() as Status /* i don't think a placeholder should ever become root? Unless maybe it can't be found? unclear */
                            }
                            fetchShareParentDepth={5}
                            limitInitialHeight={false}
                        />
                        <Show when={!loadProps().shareEditorMode}>
                            <For each={threadInfo()?.children}>
                                {(node, index) => <Comment node={node} />}
                            </For>
                            <Card class="p-4 m-4">
                                <NewCommentEditor
                                    parentStatus={
                                        threadInfo()?.tryGetStatus() as Status
                                    }
                                ></NewCommentEditor>
                            </Card>
                        </Show>
                    </Match>
                    <Match when={threadInfo.error}>
                        <div>error: {threadInfo.error}</div>
                    </Match>
                </Switch>
            </ErrorBoundary>
        </>
    );
};

export default PostPage;
