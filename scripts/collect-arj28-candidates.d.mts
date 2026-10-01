export type CandidateManifest = {
  implementationHead: string;
  fixture: string;
  candidateCount: number;
  candidates: Array<{
    filename: string;
    sha256: string;
    implementationHead: string;
    state: string;
    viewport: string;
    fixture: string;
  }>;
  axeReports: Array<{
    filename: string;
    sha256: string;
    viewport: string;
    stateCount: number;
    violations: 0;
  }>;
};
export function collectCandidates(options: {
  inputDir: string;
  outputDir: string;
  repositoryRoot?: string;
}): CandidateManifest;
