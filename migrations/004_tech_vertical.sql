-- Tech-community vertical: discovery keywords + a known seed channel.
-- Run after 003_frontier.sql.

-- Tech bases + modifiers for keyword discovery (--from-db crawl mode).
INSERT INTO keyword_terms (term, kind, lang) VALUES
    ('developers',    'base', 'en'),
    ('programming',   'base', 'en'),
    ('coding',        'base', 'en'),
    ('software',      'base', 'en'),
    ('startup',       'base', 'en'),
    ('indie hacker',  'base', 'en'),
    ('tech',          'base', 'en'),
    ('web3',          'base', 'en'),
    ('build in public','base', 'en'),
    -- modifiers / qualifiers
    ('python',        'modifier', 'en'),
    ('javascript',    'modifier', 'en'),
    ('rust',          'modifier', 'en'),
    ('community',     'modifier', 'en'),
    ('founders',      'modifier', 'en')
ON CONFLICT (term, kind) DO NOTHING;

-- Seed a known channel directly into the frontier at depth 0 so the link-graph
-- crawl resolves it, samples it, and harvests the tech channels it references.
INSERT INTO channel_frontier (username, depth, source)
VALUES ('solodevchronicles', 0, 'manual')
ON CONFLICT (username) DO NOTHING;
