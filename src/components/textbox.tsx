import { Component, For, JSX, Match, Switch, createUniqueId } from "solid-js";
import { Checkbox } from "./checkbox";

export type SimpleInputProps<T> = {
    value: T;
    setter: (s: T) => void;
    children: JSX.Element;
};

export const Textbox: Component<SimpleInputProps<string>> = (props) => {
    const id = createUniqueId();
    return (
        <>
            <label for={id}>{props.children}</label>
            <input
                id={id}
                type="text"
                class="pbInput"
                value={props.value}
                onChange={(e: { currentTarget: HTMLInputElement }) => {
                    props.setter(e.currentTarget.value);
                }}
            ></input>
        </>
    );
};

export const OrNullTextbox: Component<SimpleInputProps<string | null>> = (
    props
) => {
    return (
        <>
            <Switch>
                <Match when={props.value !== null}>
                    <Textbox value={props.value!} setter={props.setter}>
                        {props.children}
                    </Textbox>
                </Match>
                <Match when={props.value === null}>{props.children}</Match>
            </Switch>
            <Checkbox
                getter={() => props.value === null}
                setter={(v: boolean) => {
                    if (v === true) {
                        props.setter(null);
                    } else {
                        props.setter("");
                    }
                }}
            >
                null
            </Checkbox>
        </>
    );
};

export type PropertyTextboxes = {};

export interface PropertyTextboxesProps<T> {
    value: T;
    setter: (patch: Partial<T>) => void;
}

export function PropertyTextboxesBuilder<T extends object>(
    props: PropertyTextboxesProps<T>
): JSX.Element {
    const keys = Object.keys(props.value) as (keyof T)[];
    return (
        <ul>
            <For each={keys}>
                {(key, idx) => {
                    return (
                        <li>
                            <Textbox
                                value={props.value[key] as string}
                                setter={(v) => {
                                    const patch: Partial<T> = {};
                                    patch[key] = v as T[keyof T];
                                    props.setter(patch);
                                }}
                            >
                                {key as string}
                            </Textbox>
                        </li>
                    );
                }}
            </For>
        </ul>
    );
}

export const AnyPropertyTextboxes: Component<PropertyTextboxesProps<any>> = (
    props
) => PropertyTextboxesBuilder<any>(props);

export type MultiTextboxSpec = {
    key: string;
    label: string;
    description: string;
    defaultValue: string;
};

export const MultiTextbox: Component<{
    specs: MultiTextboxSpec[];
    value: any;
    setter: (key: string, value: string) => void;
}> = (props) => {
    return (
        <ul>
            <For each={props.specs}>
                {(spec, idx) => {
                    return (
                        <li>
                            <Textbox
                                value={props.value[spec.key]}
                                setter={(v) => {
                                    props.setter(spec.key, v);
                                }}
                            >
                                {spec.label}
                            </Textbox>
                        </li>
                    );
                }}
            </For>
        </ul>
    );
};
