import 'dotenv/config'; 

const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  throw new Error("Missing GITHUB_TOKEN in environment");
}

const changes = await git.diff({ staged: true });

defDiff(
  "CODE_CHANGES",          
  changes,                 
  "Git Changes Review",    
);


$`## Role
You are a senior developer whose job is to review code changes and provide meaningful feedback.

## Task
Review <CODE_CHANGES>, point out possible mistakes or bad practices, and provide suggestions for improvement.
- Be specific about what's wrong and why it's wrong
- Reference proper coding standards and best practices
- Be brief to get your point across
`;