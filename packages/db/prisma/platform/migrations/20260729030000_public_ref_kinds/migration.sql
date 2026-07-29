-- MT-3: extra routing kinds — event by id (public API) and promoter report token.
ALTER TYPE "PublicRefKind" ADD VALUE 'EVENT_ID';
ALTER TYPE "PublicRefKind" ADD VALUE 'PROMOTER_REPORT';
