import { A } from "@solidjs/router";
import { createResource, createSignal, type Component } from "solid-js";
import { tryGetAuthenticatedClient, useAuthContext } from "~/App";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Flex } from "~/components/ui/flex";
import { Grid, Col } from "~/components/ui/grid";

const Feed: Component = () => {
    return <p>this would be the feed</p>;
};

export default Feed;