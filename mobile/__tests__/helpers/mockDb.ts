// Shared useDb mock for screen tests. Screens jest.mock their import of
// lib/db with this module; tests mutate the jest.fn()s between cases.
import type {
  MeaningRow,
  SearchResult,
  SignRow,
  ThemeRow,
} from "../../lib/db";

export const searchSigns = jest.fn<Promise<SearchResult[]>, [string]>();
export const getSignsByLetter = jest.fn<Promise<SearchResult[]>, [string]>();
export const getThemes = jest.fn<Promise<ThemeRow[]>, []>();
export const getSignsByTheme = jest.fn<Promise<SearchResult[]>, [string]>();
export const getSign = jest.fn<Promise<SignRow | null>, [number]>();
export const getMeaningsForSign = jest.fn<Promise<MeaningRow[]>, [number]>();
export const getVariantSigns = jest.fn<Promise<SearchResult[]>, [string, number]>();

export const useDb = () => ({
  searchSigns,
  getSignsByLetter,
  getThemes,
  getSignsByTheme,
  getSign,
  getMeaningsForSign,
  getVariantSigns,
});

/** Reset all helpers to fresh mocks resolving to []. */
export function resetMockDb() {
  jest.clearAllMocks();
  searchSigns.mockResolvedValue([]);
  getSignsByLetter.mockResolvedValue([]);
  getThemes.mockResolvedValue([]);
  getSignsByTheme.mockResolvedValue([]);
  getSign.mockResolvedValue(null);
  getMeaningsForSign.mockResolvedValue([]);
  getVariantSigns.mockResolvedValue([]);
}

// Fixtures mirroring real rows for sign 4683 (树 / tree).
export const TREE_RESULT: SearchResult = {
  sign_id: 4683,
  image_path: "images/v3_txttree_1.jpg",
  text: "树",
  en_text: "tree",
  variant_index: null,
  letter: "S",
  theme: "植物",
};

export const TREE_SIGN: SignRow = {
  id: 4683,
  image_path: "images/v3_txttree_1.jpg",
  asl_image_path: null,
  description: "双手拇、食指成大圆形，由内向外移动两下。",
  en_description:
    "Both hands form a large circle with thumbs and index fingers; move them outward twice.",
  source_entry: "树①（树木）",
  letter: "S",
  volume: 3,
  theme: "植物",
};

export const TREE_MEANINGS: MeaningRow[] = [
  {
    id: 1,
    sign_id: 4683,
    text: "树",
    en_text: "tree",
    variant_index: 1,
    order_in_entry: 0,
  },
  {
    id: 2,
    sign_id: 4683,
    text: "树木",
    en_text: "trees",
    variant_index: null,
    order_in_entry: 1,
  },
];
