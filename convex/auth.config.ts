const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "wisher-local";

const config = {
  providers: [
    {
      domain: `https://securetoken.google.com/${projectId}`,
      applicationID: projectId,
    },
  ],
};

export default config;
