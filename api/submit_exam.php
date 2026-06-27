<?php
require_once __DIR__ . '/config.php';
handleOptions();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError('Method not allowed', 405);
}

$data = getJsonInput();
$userId = (int) ($data['userId'] ?? 0);
$answers = $data['answers'] ?? [];
$disqualified = !empty($data['disqualified']);

if ($userId <= 0) {
    jsonError('Invalid user ID.');
}

if (!is_array($answers)) {
    jsonError('Answers must be an array.');
}

try {
    $pdo = getDB();

    $userStmt = $pdo->prepare('SELECT id, specialty FROM users WHERE id = ? AND role = ?');
    $userStmt->execute([$userId, 'employee']);
    $user = $userStmt->fetch();

    if (!$user) {
        jsonError('User not found.', 404);
    }

    $track = specialtyToTrack($user['specialty']);

    $qStmt = $pdo->prepare(
        'SELECT id, correct_option FROM questions WHERE track = ? ORDER BY id ASC'
    );
    $qStmt->execute([$track]);
    $questions = $qStmt->fetchAll();

    if (count($questions) === 0) {
        jsonError('No questions available for this track.');
    }

    $answerMap = [];
    foreach ($answers as $entry) {
        if (isset($entry['question_id'])) {
            $answerMap[(int) $entry['question_id']] = $entry['selected_option'] ?? null;
        }
    }

    $totalScore = 0;
    $historyRows = [];

    foreach ($questions as $question) {
        $qId = (int) $question['id'];
        $selected = isset($answerMap[$qId]) ? strtoupper(trim($answerMap[$qId])) : null;
        $validOptions = ['A', 'B', 'C', 'D'];
        if ($selected !== null && !in_array($selected, $validOptions, true)) {
            $selected = null;
        }
        $isCorrect = ($selected !== null && $selected === $question['correct_option']) ? 1 : 0;
        if ($isCorrect) {
            $totalScore++;
        }
        $historyRows[] = [
            'question_id' => $qId,
            'selected_option' => $selected,
            'is_correct' => $isCorrect,
        ];
    }

    $totalQuestions = count($questions);
    $percentage = round(($totalScore / $totalQuestions) * 100, 2);
    $passed = !$disqualified && $percentage >= 75;
    $passingStatus = $passed ? 'Passed' : 'Failed';
    $certificateUuid = $passed ? generateUuid() : null;

    $pdo->beginTransaction();

    $resultStmt = $pdo->prepare(
        'INSERT INTO exam_results (user_id, total_score, percentage, passing_status, certificate_uuid, disqualified)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $resultStmt->execute([
        $userId,
        $totalScore,
        $percentage,
        $passingStatus,
        $certificateUuid,
        $disqualified ? 1 : 0,
    ]);
    $examResultId = (int) $pdo->lastInsertId();

    $historyStmt = $pdo->prepare(
        'INSERT INTO user_answers_history (exam_result_id, question_id, selected_option, is_correct)
         VALUES (?, ?, ?, ?)'
    );
    foreach ($historyRows as $row) {
        $historyStmt->execute([
            $examResultId,
            $row['question_id'],
            $row['selected_option'],
            $row['is_correct'],
        ]);
    }

    $pdo->commit();

    jsonResponse([
        'success' => true,
        'exam_result_id' => $examResultId,
        'total_score' => $totalScore,
        'total_questions' => $totalQuestions,
        'percentage' => $percentage,
        'passing_status' => $passingStatus,
        'certificate_uuid' => $certificateUuid,
        'disqualified' => $disqualified,
    ]);
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    jsonError('Submission failed: ' . $e->getMessage(), 500);
}

function generateUuid(): string {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}
