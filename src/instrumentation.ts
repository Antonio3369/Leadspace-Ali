export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recoverOrphanedHeavyImportJobs } = await import(
      "@/services/import/heavy-import-job"
    );
    await recoverOrphanedHeavyImportJobs();
  }
}
