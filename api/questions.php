<?php
require_once __DIR__ . '/config.php';
handleOptions();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonError('Method not allowed', 405);
}

$track = trim($_GET['track'] ?? '');
$validTracks = ['Web Dev', 'Design', 'UI/UX', 'General CS'];

if (!in_array($track, $validTracks, true)) {
    jsonError('Invalid or missing track parameter.');
}

try {
    $pdo = getDB();
    $stmt = $pdo->prepare(
        'SELECT id, question_text, option_a, option_b, option_c, option_d, track
         FROM questions WHERE track = ? ORDER BY id ASC'
    );
    $stmt->execute([$track]);
    $questions = $stmt->fetchAll();

    jsonResponse([
        'success' => true,
        'track' => $track,
        'questions' => $questions,
        'total' => count($questions),
    ]);
} catch (PDOException $e) {
    jsonError('Failed to load questions: ' . $e->getMessage(), 500);
}
