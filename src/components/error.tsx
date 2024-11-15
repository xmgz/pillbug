import { Component, createSignal, JSX, Match, Show, Switch } from "solid-js";
import { TextField, TextFieldTextArea } from "./ui/text-field";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import LoginView from "~/views/login";

export interface ErrorBoxProps {
    error: any;
    description: string;
}

export const ErrorBox: Component<ErrorBoxProps> = (props) => {
    return (
        <Switch>
            <Match when={props.error instanceof Error}>
                <div class="p-3 border-t">
                    <InnerErrorBox
                        error={props.error}
                        description={props.description}
                    ></InnerErrorBox>
                </div>
            </Match>
            <Match when={!(props.error instanceof Error)}>
                <Card>
                    <CardTitle>{props.description}</CardTitle>
                    <CardContent>No error info available</CardContent>
                </Card>
            </Match>
        </Switch>
    );
};

const InnerErrorBox: Component<{ error: Error; description: string }> = (
    props
) => {
    const [showLoginView, setShowLoginView] = createSignal<boolean>(false);

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>{props.description}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>{props.error.message}</p>
                    <div>
                        <TextField>
                            <TextFieldTextArea
                                readOnly={true}
                                class="h-[40vh]"
                                value={props.error.stack}
                            ></TextFieldTextArea>
                        </TextField>
                    </div>
                    <div>
                        <a
                            href="https://github.com/vivlim/pillbug/issues"
                            class="underline"
                            target="_blank"
                        >
                            please consider reporting this problem on github if
                            it seems like a problem with pillbug.
                        </a>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button
                        onClick={() => {
                            setShowLoginView(!showLoginView());
                        }}
                    >
                        access emergency login page
                    </Button>
                </CardFooter>
            </Card>
            <Show when={showLoginView()}>
                <LoginView />
            </Show>
        </>
    );
};

export default ErrorBox;
