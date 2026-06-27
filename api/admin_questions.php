<?php
require_once __DIR__ . '/config.php';
handleOptions();
requireAdmin();

$method = $_SERVER['REQUEST_METHOD'];
$validTracks = ['Web Dev', 'Design', 'UI/UX', 'General CS'];
$validOptions = ['A', 'B', 'C', 'D'];

try {
    $pdo = getDB();

    if ($method === 'GET') {
        $stmt = $pdo->query(
            'SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, track
             FROM questions ORDER BY track, id ASC'
        );
        jsonResponse(['success' => true, 'questions' => $stmt->fetchAll()]);
    }

    if ($method === 'POST') {
        $data = getJsonInput();
        validateQuestionData($data, $validTracks, $validOptions);

        $stmt = $pdo->prepare(
            'INSERT INTO questions (question_text, option_a, option_b, option_c, option_d, correct_option, track)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            trim($data['question_text']),
            trim($data['option_a']),
            trim($data['option_b']),
            trim($data['option_c']),
            trim($data['option_d']),
            strtoupper($data['correct_option']),
            $data['track'],
        ]);

        jsonResponse(['success' => true, 'id' => (int) $pdo->lastInsertId()], 201);
    }

    if ($method === 'PUT') {
        $data = getJsonInput();
        $id = (int) ($data['id'] ?? 0);
        if ($id <= 0) {
            jsonError('Question ID is required.');
        }
        validateQuestionData($data, $validTracks, $validOptions);

        $stmt = $pdo->prepare(
            'UPDATE questions SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?,
             correct_option = ?, track = ? WHERE id = ?'
        );
        $stmt->execute([
            trim($data['question_text']),
            trim($data['option_a']),
            trim($data['option_b']),
            trim($data['option_c']),
            trim($data['option_d']),
            strtoupper($data['correct_option']),
            $data['track'],
            $id,
        ]);

        jsonResponse(['success' => true, 'id' => $id]);
    }

    if ($method === 'DELETE') {
        $id = (int) ($_GET['id'] ?? getJsonInput()['id'] ?? 0);
        if ($id <= 0) {
            jsonError('Question ID is required.');
        }
        $stmt = $pdo->prepare('DELETE FROM questions WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(['success' => true, 'deleted' => $id]);
    }

    jsonError('Method not allowed', 405);
} catch (PDOException $e) {
    jsonError('Question operation failed: ' . $e->getMessage(), 500);
}

function validateQuestionData(array $data, array $validTracks, array $validOptions): void {
    $required = ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option', 'track'];
    foreach ($required as $field) {
        if (empty(trim($data[$field] ?? ''))) {
            jsonError("Field '$field' is required.");
        }
    }
    if (!in_array($data['track'], $validTracks, true)) {
        jsonError('Invalid track.');
    }
    if (!in_array(strtoupper($data['correct_option']), $validOptions, true)) {
        jsonError('Invalid correct option.');
    }
}
