export type CandidateManifest = {
  implementationHead: string;
  sources: Array<{
    prefix: string;
    fixture: string;
    stateCount: number;
  }>;
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
  arj28Dir: string;
  arj31Dir: string;
  outputDir: string;
  repositoryRoot?: string;
}): CandidateManifest;
