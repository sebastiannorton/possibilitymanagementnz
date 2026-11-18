export function gql(strings, ...args) {
  let str = "";
  strings.forEach((string, i) => {
    str += string + (args[i] || "");
  });
  return str;
}
export const ExpandTheBoxPartsFragmentDoc = gql`
    fragment ExpandTheBoxParts on ExpandTheBox {
  __typename
  blocks {
    __typename
    ... on ExpandTheBoxBlocksHeading {
      eyebrow
      title
      level
    }
    ... on ExpandTheBoxBlocksParagraph {
      content
    }
    ... on ExpandTheBoxBlocksImage {
      src
      alt
      caption
    }
    ... on ExpandTheBoxBlocksDetails {
      rows {
        __typename
        label
        value
      }
    }
    ... on ExpandTheBoxBlocksSection {
      eyebrow
      heading
      paragraphs
    }
    ... on ExpandTheBoxBlocksLinkList {
      heading
      links {
        __typename
        label
        url
        external
      }
    }
    ... on ExpandTheBoxBlocksCta {
      text
      label
      url
      external
    }
  }
}
    `;
export const ExpandTheBoxDocument = gql`
    query expandTheBox($relativePath: String!) {
  expandTheBox(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        hasReferences
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...ExpandTheBoxParts
  }
}
    ${ExpandTheBoxPartsFragmentDoc}`;
export const ExpandTheBoxConnectionDocument = gql`
    query expandTheBoxConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: ExpandTheBoxFilter) {
  expandTheBoxConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            hasReferences
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...ExpandTheBoxParts
      }
    }
  }
}
    ${ExpandTheBoxPartsFragmentDoc}`;
export function getSdk(requester) {
  return {
    expandTheBox(variables, options) {
      return requester(ExpandTheBoxDocument, variables, options);
    },
    expandTheBoxConnection(variables, options) {
      return requester(ExpandTheBoxConnectionDocument, variables, options);
    }
  };
}
import { createClient } from "tinacms/dist/client";
const generateRequester = (client) => {
  const requester = async (doc, vars, options) => {
    let url = client.apiUrl;
    if (options?.branch) {
      const index = client.apiUrl.lastIndexOf("/");
      url = client.apiUrl.substring(0, index + 1) + options.branch;
    }
    const data = await client.request({
      query: doc,
      variables: vars,
      url
    }, options);
    return { data: data?.data, errors: data?.errors, query: doc, variables: vars || {} };
  };
  return requester;
};
export const ExperimentalGetTinaClient = () => getSdk(
  generateRequester(
    createClient({
      url: "http://localhost:4001/graphql",
      queries
    })
  )
);
export const queries = (client) => {
  const requester = generateRequester(client);
  return getSdk(requester);
};
