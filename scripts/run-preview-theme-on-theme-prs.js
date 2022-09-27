/**
 * @file Small script that can be used to run the preview theme script on old theme PRs.
 */
import * as dotenv from "dotenv";
dotenv.config();

import { debug } from "@actions/core";
import github from "@actions/github";
import { RequestError } from "@octokit/request-error";
import theme_preview, { getGithubToken, getRepoInfo } from "./preview-theme.js";

// Script parameters
const DRY_RUN = true;

/**
 * Fetch open PRs from a given repository.
 * @param user The user name of the repository owner.
 * @param repo The name of the repository.
 * @returns The open PRs.
 */
export const fetchOpenPRs = async (octokit, user, repo) => {
  const openPRs = [];
  let hasNextPage = true;
  let endCursor;
  while (hasNextPage) {
    try {
      const { repository } = await octokit.graphql(
        `
          {
            repository(owner: "${user}", name: "${repo}") {
              open_prs: pullRequests(${
                endCursor ? `after: "${endCursor}", ` : ""
              }
                first: 100, states: OPEN, orderBy: {field: CREATED_AT, direction: DESC}) {
                nodes {
                  number
                  labels(first: 100, orderBy:{field: CREATED_AT, direction: DESC}) {
                    nodes {
                        name
                    }
                  }
                }
                pageInfo {
                  endCursor
                  hasNextPage
                }
              }
            }
          }
        `,
      );
      openPRs.push(...repository.open_prs.nodes);
      hasNextPage = repository.open_prs.pageInfo.hasNextPage;
      endCursor = repository.open_prs.pageInfo.endCursor;
    } catch (error) {
      if (error instanceof RequestError) {
        setFailed(`Could not retrieve top PRs using GraphQl: ${error.message}`);
      }
      throw error;
    }
  }
  return openPRs;
};

/**
 * Retrieve pull requests that have a given label.
 * @param pull The pull requests to check.
 * @param label The label to check for.
 */
export const pullsWithLabel = (pulls, label) => {
  return pulls.filter((pr) => {
    return pr.labels.nodes.some((lab) => lab.name === label);
  });
};

/**
 * Main function.
 */
export const run = async () => {
  if (DRY_RUN) {
    process.env.DRY_RUN = "true";
  }

  // Create octokit client.
  debug("Creating octokit client");
  const octokit = github.getOctokit(getGithubToken());
  const { owner, repo } = getRepoInfo(github.context);

  // Retrieve all theme pull requests.
  debug("Retrieving all theme pull requests");
  const prs = await fetchOpenPRs(octokit, owner, repo);
  const themePRs = pullsWithLabel(prs, "themes");
  const PRNumbers = themePRs.map((pr) => pr.number);

  // Loop through all theme pull requests and apply the preview theme script.
  for (const pr of PRNumbers) {
    debug(`Running preview theme script for PR ${pr}`);
    await theme_preview(pr);
  }
};

run();
